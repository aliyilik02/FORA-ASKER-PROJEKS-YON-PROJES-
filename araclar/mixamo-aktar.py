"""Mixamo animasyon FBX'lerini (Without Skin) Meshy rig'li modele aktarır ve tek GLB'ye yazar.

Kullanım (Blender 5.x, başsız):
  blender -b --python araclar/mixamo-aktar.py -- <model.fbx> <cikis.glb> <klip1.fbx> [klip2.fbx ...] [--render <png_klasoru>]

Yöntem: iki iskelet de Mixamo kemik adlarını kullanır ama dinlenme pozları (Meshy A-poz, Mixamo T-poz) ve kemik roll'ları
farklıdır (bacakta ~175°, kolda ~120°). Dünya uzayında dönüşü aynen kopyalamak uzuvları kendi ekseninde burkuyor ("çöp
adam"). Burada her kemik için hedef dünya dönüşü şöyle kurulur:

    hedef_poz = kaynak_poz @ kaynak_dinlenme⁻¹ @ hizala @ hedef_dinlenme

`hizala`: Meshy kemiğinin dinlenme yönünü Mixamo kemiğinin dinlenme yönüne götüren en küçük dönüş. Böylece kemiğin
YÖNÜ Mixamo klibini izler, ROLL'u Meshy'nin kendi dinlenmesine göre kalır (mesh burkulmaz). Kalça konumu kaynaktan,
boy oranıyla. Dinlenme yönü 60°'den fazla farklı kemikler (ayak ucu, parmak uçları) dinlenmede kalır. Çözüm sahne
güncellemesi olmadan matrislerle hesaplanır (kemik başına keyframe), her klip bir eylem → NLA izi → glTF'te ayrı animasyon.
"""
import bpy, sys, os, math, re
from mathutils import Matrix, Vector, Quaternion

arg = sys.argv[sys.argv.index("--") + 1 :]
render_dir = None
if "--render" in arg:
    i = arg.index("--render")
    render_dir = arg[i + 1]
    arg = arg[:i] + arg[i + 2 :]
model, cikis, animler = arg[0], arg[1], arg[2:]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=model, use_anim=False)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
arm.name = "Armature"
mesh = next(o for o in bpy.data.objects if o.type == "MESH")
mesh.name = "asker_komando"
for im in bpy.data.images:
    if im.size[0] > 2048:
        im.scale(2048, 2048)
# Malzeme: yalnız renk + normal dokuları (Meshy'nin metal/pürüz dokuları gürültülü)
mat = mesh.data.materials[0] if mesh.data.materials else None
if mat and mat.use_nodes:
    bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf:
        bsdf.inputs["Roughness"].default_value = 0.85
        bsdf.inputs["Metallic"].default_value = 0.0
        for l in list(mat.node_tree.links):
            if l.to_node == bsdf and l.to_socket.name in ("Metallic", "Roughness", "Specular IOR Level", "Specular"):
                mat.node_tree.links.remove(l)

AW = arm.matrix_world.copy()
AWi = AW.inverted()
kemikler = [b for b in arm.data.bones]  # ebeveyn önce gelir (Blender sıralaması ağaç sırasıdır)
ebeveyn_once = []
def ekle(b):
    if b in ebeveyn_once:
        return
    if b.parent:
        ekle(b.parent)
    ebeveyn_once.append(b)
for b in kemikler:
    ekle(b)

def yon(ao, b):
    return (ao.matrix_world.to_3x3() @ (b.tail_local - b.head_local)).normalized()

for pb in arm.pose.bones:
    pb.rotation_mode = "QUATERNION"
arm.animation_data_create()
hips_ad = "mixamorig:Hips"
meshy_kalca = (AW @ arm.data.bones[hips_ad].head_local).z
sonuclar = []

for yol in animler:
    ad = re.sub(r"\.fbx$", "", os.path.basename(yol), flags=re.I)
    onceki = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=yol)
    yeni = [o for o in bpy.data.objects if o not in onceki]
    src = next(o for o in yeni if o.type == "ARMATURE")
    act = src.animation_data.action
    SW = src.matrix_world.copy()
    src_kalca = (SW @ src.data.bones[hips_ad].head_local).z if src.data.bones.get(hips_ad) else meshy_kalca
    oran = meshy_kalca / src_kalca if src_kalca > 0.05 else 1.0
    # Kemik başına sabitler: hizalama ve dinlenme dönüşleri
    bilgi = {}
    atla = set()
    for b in ebeveyn_once:
        m = src.data.bones.get(b.name)
        if not m:
            continue
        d1, d2 = yon(arm, b), yon(src, m)
        if math.degrees(d1.angle(d2, 0)) > 60:
            atla.add(b.name)
            continue
        hizala = d1.rotation_difference(d2)
        hedef_dinlenme = (AW @ b.matrix_local).to_quaternion()
        kaynak_dinlenme = (SW @ m.matrix_local).to_quaternion()
        bilgi[b.name] = kaynak_dinlenme.inverted() @ hizala @ hedef_dinlenme  # sabit ofset: hedef = kaynak_poz @ ofset
    yeni_act = bpy.data.actions.new(ad)
    arm.animation_data.action = yeni_act
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    sc = bpy.context.scene
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        poz = {}  # kemik adı → hedef poz-uzayı matrisi (armatür uzayı)
        for b in ebeveyn_once:
            pb = arm.pose.bones[b.name]
            spb = src.pose.bones.get(b.name)
            if b.parent is None:
                ust = Matrix.Identity(4)
                ust_local = Matrix.Identity(4)
            else:
                ust = poz[b.parent.name]
                ust_local = b.parent.matrix_local
            dinlenme_zinciri = ust @ ust_local.inverted() @ b.matrix_local  # basis = I iken poz matrisi
            if spb is None or b.name in atla:
                basis = Matrix.Identity(4)
            else:
                kaynak_poz = (SW @ spb.matrix).to_quaternion()
                hedef_dunya = kaynak_poz @ bilgi[b.name]
                hedef_arm = (AWi.to_quaternion() @ hedef_dunya)  # armatür uzayı
                basis_rot = dinlenme_zinciri.to_quaternion().inverted() @ hedef_arm
                basis = basis_rot.to_matrix().to_4x4()
                if b.name == hips_ad:
                    # Kalça konumu: kaynağın dünya konumu boy oranıyla, armatür uzayına
                    konum_dunya = (SW @ spb.matrix).to_translation() * oran
                    konum_arm = AWi @ konum_dunya
                    basis.translation = b.matrix_local.inverted() @ konum_arm
            M = dinlenme_zinciri @ basis
            poz[b.name] = M
            if spb is None or b.name in atla:
                continue
            pb.rotation_quaternion = basis.to_quaternion()
            pb.keyframe_insert("rotation_quaternion", frame=f)
            if b.name == hips_ad:
                pb.location = basis.to_translation()
                pb.keyframe_insert("location", frame=f)
    tr = arm.animation_data.nla_tracks.new()
    tr.name = ad
    st = tr.strips.new(ad, f0, yeni_act)
    st.name = ad
    arm.animation_data.action = None
    if render_dir:
        src.hide_render = True
        sc.frame_set((f0 + f1) // 2)
        for t in arm.animation_data.nla_tracks:
            t.mute = t != tr
        if not sc.camera:
            bpy.ops.object.camera_add(location=(0, -6, 0.9), rotation=(math.radians(90), 0, 0))
            sc.camera = bpy.context.object
            bpy.ops.object.light_add(type="SUN", location=(2, -4, 5))
            bpy.context.object.data.energy = 3
            sc.render.resolution_x = 500
            sc.render.resolution_y = 600
            sc.render.engine = "BLENDER_WORKBENCH"
        sc.render.filepath = os.path.join(render_dir, "rt_" + re.sub(r"[^A-Za-z0-9]+", "_", ad) + ".png")
        bpy.ops.render.render(write_still=True)
    for o in yeni:
        bpy.data.objects.remove(o)
    sonuclar.append((ad, f1 - f0 + 1))
    print("AKTARILDI", ad, f1 - f0 + 1, "kare, oran", round(oran, 3), "atlanan", len(atla))

for t in arm.animation_data.nla_tracks:
    t.mute = False
for o in list(bpy.data.objects):
    if o.type in ("CAMERA", "LIGHT"):
        bpy.data.objects.remove(o)
bpy.ops.object.select_all(action="DESELECT")
arm.select_set(True)
mesh.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=cikis, export_format="GLB", use_selection=False, export_animations=True, export_animation_mode="NLA_TRACKS",
    export_skins=True, export_apply=True, export_image_format="JPEG", export_jpeg_quality=85, export_texcoords=True,
    export_normals=True, export_yup=True,
)
print("GLB", cikis, round(os.path.getsize(cikis) / 1e6, 1), "MB", len(sonuclar), "klip")
