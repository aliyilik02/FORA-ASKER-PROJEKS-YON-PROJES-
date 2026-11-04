"""Meshy GLB'sini oynatıcıya hazırlar (Blender 5.x, başsız):
  blender -b --python araclar/model-hazirla.py -- <girdi.glb> <cikti.glb> --ucgen 1500 --boy 0.6 [--eksen uzun|yukseklik] [--doku 1024] [--render <png>]

- Decimate (Collapse) ile hedef üçgen sayısına iner, UV ve dokular korunur.
- En uzun kenar (`--eksen uzun`, varsayılan) ya da yükseklik (`--eksen yukseklik`) `--boy` metre olur.
- Orijin taban merkezine alınır (Y yukarı glTF'te taban y=0), dokular JPEG q85, en çok 2048 px.
"""
import bpy, sys, os
from mathutils import Vector

arg = sys.argv[sys.argv.index("--") + 1:]
girdi, cikti = arg[0], arg[1]
def secenek(ad, varsayilan=None):
    return arg[arg.index(ad) + 1] if ad in arg else varsayilan
ucgen = int(secenek("--ucgen", "0"))
boy = float(secenek("--boy", "0"))
eksen = secenek("--eksen", "uzun")
render = secenek("--render")
doku = int(secenek("--doku", "2048"))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=girdi)
meshler = [o for o in bpy.data.objects if o.type == "MESH"]
if not meshler:
    raise SystemExit("ağ yok")
bpy.ops.object.select_all(action="DESELECT")
for o in meshler:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshler[0]
# Dönüşümleri uygula, tek ağda birleştir
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
if len(meshler) > 1:
    bpy.ops.object.join()
mesh = bpy.context.view_layer.objects.active
mesh.name = os.path.splitext(os.path.basename(cikti))[0]
for o in list(bpy.data.objects):
    if o != mesh:
        bpy.data.objects.remove(o)

onceki = len(mesh.data.polygons)
if ucgen and onceki > ucgen * 1.2:
    mod = mesh.modifiers.new("seyrelt", "DECIMATE")
    mod.ratio = ucgen / onceki
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)

# Ölçek ve orijin (Blender Z yukarı)
bpy.ops.object.mode_set(mode="OBJECT")
kose = [mesh.matrix_world @ Vector(c) for c in mesh.bound_box]
mn = Vector((min(v.x for v in kose), min(v.y for v in kose), min(v.z for v in kose)))
mx = Vector((max(v.x for v in kose), max(v.y for v in kose), max(v.z for v in kose)))
boyut = mx - mn
if boy > 0:
    mevcut = boyut.z if eksen == "yukseklik" else max(boyut)
    if mevcut > 1e-6:
        mesh.scale *= boy / mevcut
        bpy.ops.object.transform_apply(scale=True)
        kose = [mesh.matrix_world @ Vector(c) for c in mesh.bound_box]
        mn = Vector((min(v.x for v in kose), min(v.y for v in kose), min(v.z for v in kose)))
        mx = Vector((max(v.x for v in kose), max(v.y for v in kose), max(v.z for v in kose)))
        boyut = mx - mn
merkez = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
for v in mesh.data.vertices:
    v.co -= merkez
mesh.location = (0, 0, 0)

for im in bpy.data.images:
    if im.size[0] > doku:
        im.scale(doku, doku)

if render:
    import math
    uzak = max(boyut) * 2.4
    hedef = Vector((0, 0, boyut.z / 2))
    kam_konum = Vector((uzak * 0.6, -uzak * 0.8, boyut.z / 2 + uzak * 0.45))
    bpy.ops.object.camera_add(location=kam_konum)
    kam = bpy.context.object
    kam.rotation_euler = (hedef - kam_konum).to_track_quat("-Z", "Y").to_euler()
    sc = bpy.context.scene
    sc.camera = kam
    sc.render.resolution_x, sc.render.resolution_y = 640, 480
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "TEXTURE"
    sc.render.filepath = render
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(kam)

bpy.ops.object.select_all(action="DESELECT")
mesh.select_set(True)
bpy.ops.export_scene.gltf(filepath=cikti, export_format="GLB", use_selection=True, export_apply=True,
                          export_image_format="JPEG", export_jpeg_quality=85, export_yup=True, export_animations=False)
print(f"HAZIR {cikti} üçgen {onceki} → {len(mesh.data.polygons)} boyut {tuple(round(v, 3) for v in boyut)} MB {os.path.getsize(cikti)/1e6:.1f}")
