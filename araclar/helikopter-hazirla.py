"""Palasız Meshy helikopter gövdesini oynatıcıya hazırlar (Blender 5.x, başsız):
  blender -b --python araclar/helikopter-hazirla.py -- <govde.glb> <cikti.glb> [--ucgen 50000] [--boy 5.1] [--doku 2048] [--render <png>]

- Decimate ile hedef üçgen sayısı, yükseklik `--boy` m, orijin taban merkezi.
- Ana rotor göbeği (en üst nokta kümesi) ve kuyruk rotor göbeği (kuyruk ucundaki üst küme) bulunur; palalar
  prosedürel eklenir: "rotor" (4 pala, yarıçap gövde uzunluğunun %54'ü; glTF y ekseni etrafında döner) ve
  "kuyruk_rotor" (4 pala, yarıçap %11; düğüm yerel x ekseni yanal eksene bakar, oynatıcı rotation.x ile döndürür).
  Oynatıcı (`helikopter3b.ts`) adı rotor/blade/prop içeren düğümleri döndürür; "kuyruk" içereni x ekseninde.
"""
import bpy, bmesh, sys, os, math
from mathutils import Vector

arg = sys.argv[sys.argv.index("--") + 1:]
girdi, cikti = arg[0], arg[1]
sec = lambda ad, v=None: arg[arg.index(ad) + 1] if ad in arg else v
ucgen = int(sec("--ucgen", "50000")); boy = float(sec("--boy", "5.1")); render = sec("--render"); doku = int(sec("--doku", "2048"))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=girdi)
meshler = [o for o in bpy.data.objects if o.type == "MESH"]
bpy.ops.object.select_all(action="DESELECT")
for o in meshler:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshler[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
if len(meshler) > 1:
    bpy.ops.object.join()
govde = bpy.context.view_layer.objects.active
govde.name = "govde"
for o in list(bpy.data.objects):
    if o != govde:
        bpy.data.objects.remove(o)

onceki = len(govde.data.polygons)
if onceki > ucgen * 1.2:
    mod = govde.modifiers.new("seyrelt", "DECIMATE")
    mod.ratio = ucgen / onceki
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)


def kutu(o):
    ks = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return Vector([min(v[i] for v in ks) for i in range(3)]), Vector([max(v[i] for v in ks) for i in range(3)])


mn, mx = kutu(govde)
govde.scale *= boy / (mx.z - mn.z)
bpy.ops.object.transform_apply(scale=True)
mn, mx = kutu(govde)
# Gövde uzun ekseni x olsun (Meshy çoğunlukla öyle); değilse 90° çevir
if (mx.y - mn.y) > (mx.x - mn.x):
    govde.rotation_euler = (0, 0, math.radians(90))
    bpy.ops.object.transform_apply(rotation=True)
    mn, mx = kutu(govde)
H, L = mx.z - mn.z, mx.x - mn.x
merkez = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
for v in govde.data.vertices:
    v.co -= merkez
mn, mx = kutu(govde)
vs = [v.co.copy() for v in govde.data.vertices]

# Ana rotor göbeği: en üst %4'teki noktaların merkezi (rotor direği)
ust = [v for v in vs if v.z > mx.z - 0.04 * H]
gobek = Vector((sum(v.x for v in ust) / len(ust), sum(v.y for v in ust) / len(ust), mx.z - 0.01 * H))
# Kuyruk: göbekten uzak olan uç
kuyruk_isaret = 1 if abs(mx.x - gobek.x) > abs(mn.x - gobek.x) else -1
kuyruk_x = mx.x if kuyruk_isaret > 0 else mn.x
aday = [v for v in vs if abs(v.x - kuyruk_x) < 0.12 * L and v.z > mn.z + 0.55 * H]
if not aday:
    aday = [v for v in vs if abs(v.x - kuyruk_x) < 0.2 * L]
kgobek = Vector((sum(v.x for v in aday) / len(aday), sum(v.y for v in aday) / len(aday), max(v.z for v in aday) - 0.03 * H))
print(f"H {H:.2f} L {L:.2f} ana göbek {tuple(round(c, 2) for c in gobek)} kuyruk göbeği {tuple(round(c, 2) for c in kgobek)}")

# Pala malzemesi
mal = bpy.data.materials.new("pala")
mal.use_nodes = True
bsdf = mal.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Base Color"].default_value = (0.05, 0.05, 0.045, 1)
bsdf.inputs["Roughness"].default_value = 0.6
bsdf.inputs["Metallic"].default_value = 0.2


def palalar(ad, yaricap, kord, kalinlik, adet, govde_yaricap, govde_yuk):
    """Dönme ekseni yerel Z olan pala çarkı (+ küçük göbek silindiri). Yerel orijin göbekte."""
    bm = bmesh.new()
    for i in range(adet):
        aci = 2 * math.pi * i / adet
        c, s = math.cos(aci), math.sin(aci)
        # Pala: kökten uca hafif daralan kutu
        r0, r1 = govde_yaricap * 0.9, yaricap
        koseler = []
        for (r, k) in ((r0, kord), (r1, kord * 0.85)):
            for sy in (-1, 1):
                for sz in (-1, 1):
                    x, y, z = r, sy * k / 2, sz * kalinlik / 2
                    koseler.append(bm.verts.new((x * c - y * s, x * s + y * c, z)))
        bm.verts.ensure_lookup_table()
        v = koseler
        yuzler = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 2, 6, 4), (1, 5, 7, 3), (0, 4, 5, 1), (2, 3, 7, 6)]
        for f in yuzler:
            bm.faces.new([v[j] for j in f])
    bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=govde_yaricap, radius2=govde_yaricap, depth=govde_yuk)
    me = bpy.data.meshes.new(ad)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mal)
    o = bpy.data.objects.new(ad, me)
    bpy.context.scene.collection.objects.link(o)
    return o


rotor = palalar("rotor", 0.54 * L, 0.035 * L, 0.006 * L, 4, 0.03 * L, 0.02 * H)
# Palalar göbek plakasının üstünde döner: direğin tepesinden yüksekliğin %3 yukarı (duvarda "pala biraz aşağıda" görüldü)
rotor.location = gobek + Vector((0, 0, 0.03 * H))
# Ana rotor: dönme ekseni dünya Z (glTF Y). Yerel Z zaten yukarı.
kuyruk = palalar("kuyruk_rotor", 0.11 * L, 0.018 * L, 0.004 * L, 4, 0.012 * L, 0.012 * L)
# Kuyruk rotoru: pala düzlemi dikey (x-z), dönme ekseni yanal (dünya Y). Yerel Z'yi dünya Y'ye çevir: X etrafında -90°.
# glTF'e Y-up aktarımda yerel x dünya x'te kalır; oynatıcı rotation.x ile döndürür → yerel x ekseni dönme ekseni olmalı.
# Bu yüzden yerel Z→dünya Y için önce -90° X, sonra yerel X'i yanal eksene oturtmak için Z etrafında 90°.
kuyruk.rotation_euler = (math.radians(-90), 0, math.radians(90))
kuyruk.location = kgobek + Vector((0, (0.06 * H) * (1 if kgobek.y >= 0 else -1), 0))

for im in bpy.data.images:
    if im.size[0] > doku:
        im.scale(doku, doku)

if render:
    uzak = L * 1.25
    kon = Vector((uzak * 0.75, -uzak * 0.65, H * 0.5 + uzak * 0.35))
    bpy.ops.object.camera_add(location=kon)
    kam = bpy.context.object
    kam.rotation_euler = (Vector((0, 0, H / 2)) - kon).to_track_quat("-Z", "Y").to_euler()
    sc = bpy.context.scene
    sc.camera = kam
    sc.render.resolution_x, sc.render.resolution_y = 900, 560
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "TEXTURE"
    sc.render.filepath = render
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(kam)

bpy.ops.object.select_all(action="DESELECT")
for o in (govde, rotor, kuyruk):
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=cikti, export_format="GLB", use_selection=True, export_apply=True,
                          export_image_format="JPEG", export_jpeg_quality=85, export_yup=True, export_animations=False)
print(f"HAZIR {cikti} üçgen {onceki} → {len(govde.data.polygons)} MB {os.path.getsize(cikti)/1e6:.1f}")
