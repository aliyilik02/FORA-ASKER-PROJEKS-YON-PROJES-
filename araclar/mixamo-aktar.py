"""Mixamo animasyon FBX'lerini (Without Skin) Meshy rig'li modele aktarır ve tek GLB'ye yazar.
Kullanım: blender -b --python retarget.py -- <model.fbx> <cikis.glb> <anim1.fbx> [anim2.fbx ...] [--render <png_dir>]
Yöntem: her Meshy kemiğine aynı adlı Mixamo kemiğinden dünya uzayında Copy Rotation (kalça: + Copy Location, boy oranıyla),
görsel anahtarlamayla pişir, kısıtları kaldır; her klip ayrı eylem → NLA izi → glTF ayrı animasyon."""
import bpy, sys, os, math, re
arg = sys.argv[sys.argv.index("--")+1:]
render_dir = None
if "--render" in arg:
    i = arg.index("--render"); render_dir = arg[i+1]; arg = arg[:i] + arg[i+2:]
model, cikis, animler = arg[0], arg[1], arg[2:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=model, use_anim=False)
arm = next(o for o in bpy.data.objects if o.type=='ARMATURE'); arm.name="Armature"
mesh = next(o for o in bpy.data.objects if o.type=='MESH'); mesh.name="asker_komando"
# Dokular 2K, gömülü kalsın
for im in bpy.data.images:
    if im.size[0] > 2048: im.scale(2048, 2048)
# Materyal: Meshy FBX'in Phong'u yerine Principled (glTF için metal/pürüz doğru aktarılsın)
mat = mesh.data.materials[0] if mesh.data.materials else None
if mat and mat.use_nodes:
    bsdf = next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'), None)
    if bsdf:
        bsdf.inputs['Roughness'].default_value = 0.85
        bsdf.inputs['Metallic'].default_value = 0.0
        # Yalnız renk + normal dokuları bağlı kalsın (metalik/pürüz dokuları Meshy'de gürültülü)
        for l in list(mat.node_tree.links):
            if l.to_node == bsdf and l.to_socket.name in ('Metallic','Roughness','Specular IOR Level','Specular'):
                mat.node_tree.links.remove(l)
def kalca_yuksekligi(a):
    bpy.context.view_layer.update()
    return (a.matrix_world @ a.pose.bones['mixamorig:Hips'].head).z
meshy_kalca = kalca_yuksekligi(arm)
arm.animation_data_create()
sonuclar=[]
for yol in animler:
    ad = re.sub(r'\.fbx$', '', os.path.basename(yol), flags=re.I)
    onceki=set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=yol)
    yeni=[o for o in bpy.data.objects if o not in onceki]
    src=next(o for o in yeni if o.type=='ARMATURE')
    act=src.animation_data.action
    # Boy oranı: Mixamo iskeletinin dinlenme kalçası
    src_kalca = kalca_yuksekligi(src) if src.pose.bones.get('mixamorig:Hips') else meshy_kalca
    oran = meshy_kalca / src_kalca if src_kalca > 0.05 else 1.0
    # Kısıtlar
    # Dinlenme yönü çok farklı kemikler (ayak ucu, parmak uçları: Meshy ile Mixamo farklı) kopyalanmaz, dinlenmede kalır
    bpy.context.view_layer.update()
    atla=set()
    for b in arm.data.bones:
        m=src.data.bones.get(b.name)
        if not m: continue
        v1=(arm.matrix_world.to_3x3() @ (b.tail_local-b.head_local)).normalized()
        v2=(src.matrix_world.to_3x3() @ (m.tail_local-m.head_local)).normalized()
        if math.degrees(v1.angle(v2,0)) > 60: atla.add(b.name)
    for pb in arm.pose.bones:
        if src.pose.bones.get(pb.name) is None or pb.name in atla: continue
        c=pb.constraints.new('COPY_ROTATION'); c.target=src; c.subtarget=pb.name; c.owner_space='WORLD'; c.target_space='WORLD'
        if pb.name=='mixamorig:Hips':
            l=pb.constraints.new('COPY_LOCATION'); l.target=src; l.subtarget=pb.name; l.owner_space='WORLD'; l.target_space='WORLD'
    # Kaynak kalça konumunu boy oranıyla ölçekle (basit: kaynak armatürün ölçeği)
    src.scale = (oran, oran, oran)
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True)
    bpy.ops.object.mode_set(mode='POSE'); bpy.ops.pose.select_all(action='SELECT')
    bpy.ops.nla.bake(frame_start=f0, frame_end=f1, only_selected=True, visual_keying=True, clear_constraints=True, use_current_action=False, bake_types={'POSE'})
    bpy.ops.object.mode_set(mode='OBJECT')
    yeni_act = arm.animation_data.action; yeni_act.name = ad
    # NLA izine koy (glTF her izi ayrı animasyon yazar)
    tr = arm.animation_data.nla_tracks.new(); tr.name = ad
    st = tr.strips.new(ad, f0, yeni_act); st.name = ad
    arm.animation_data.action = None
    if render_dir:
        src.hide_render=True; mesh.hide_render=False
        bpy.context.scene.frame_set((f0+f1)//2)
        tr.mute=False
        for t in arm.animation_data.nla_tracks: t.mute = (t != tr)
        if not bpy.context.scene.camera:
            bpy.ops.object.camera_add(location=(0,-6,0.9), rotation=(math.radians(90),0,0)); bpy.context.scene.camera=bpy.context.object
            bpy.ops.object.light_add(type='SUN', location=(2,-4,5)); bpy.context.object.data.energy=3
            sc=bpy.context.scene; sc.render.resolution_x=500; sc.render.resolution_y=600; sc.render.engine='BLENDER_WORKBENCH'
        bpy.context.scene.render.filepath=os.path.join(render_dir, "rt_"+re.sub(r'[^A-Za-z0-9]+','_',ad)+".png"); bpy.ops.render.render(write_still=True)
    for o in yeni: bpy.data.objects.remove(o)
    sonuclar.append((ad, f1-f0+1))
    print("AKTARILDI", ad, f1-f0+1, "kare, oran", round(oran,3), "atlanan", sorted(atla))
for t in arm.animation_data.nla_tracks: t.mute=False
# Dışa aktar
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); mesh.select_set(True)
for o in bpy.data.objects:
    if o.type in ('CAMERA','LIGHT'): bpy.data.objects.remove(o)
bpy.ops.export_scene.gltf(filepath=cikis, export_format='GLB', use_selection=False, export_animations=True, export_animation_mode='NLA_TRACKS', export_skins=True, export_apply=True, export_image_format='JPEG', export_jpeg_quality=85, export_texcoords=True, export_normals=True, export_yup=True)
print("GLB", cikis, round(os.path.getsize(cikis)/1e6,1), "MB", sonuclar)
