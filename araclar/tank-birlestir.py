"""Meshy tank gövdesi (kulesiz) + tank kulesi (namlusuz) → tek GLB (Blender 5.x, başsız):
  blender -b --python araclar/tank-birlestir.py -- <govde.glb> <kule.glb> <cikti.glb> [--govde-boy 7.5] [--kule-boy 4.2]
      [--on x-|x+] [--kule-on x-|x+] [--ucgen 60000] [--doku 2048] [--render png]

Düğümler (oynatıcı `figurler3b.ts` sözleşmesi, manifest `kule`/`namlu`):
- "govde": gövde, uzunluk `--govde-boy` m, taban orijinde, ön taraf glTF −x (`--on` gövdenin kendi hangi x yönüne baktığı).
- "kule": kule, uzunluk `--kule-boy`, kule bileziğinin (gövde üstünün orta en yüksek düzlüğü) üstüne; düğümün yerel z'si
  dünya yukarı, yerel −x ileri (kuleyiDondur bu eksenlerle döner). Blender'da nesne dönüşü X −90°, geometri tersine
  döndürülerek yerinde tutulur.
- "namlu": kulenin çocuğu, 5,3 m silindir (L44), mantlet noktasından (kulenin ön yüz orta yüksekliği) ileri, 1° yukarı.
"""
import bpy, bmesh, sys, os, math
from mathutils import Vector, Matrix

arg = sys.argv[sys.argv.index("--") + 1:]
govde_yol, kule_yol, cikti = arg[0], arg[1], arg[2]
sec = lambda ad, v=None: arg[arg.index(ad) + 1] if ad in arg else v
govde_boy = float(sec("--govde-boy", "7.5")); kule_boy = float(sec("--kule-boy", "4.2"))
on = sec("--on", "x-"); kule_on = sec("--kule-on", "x-")
ucgen = int(sec("--ucgen", "60000")); doku = int(sec("--doku", "2048")); render = sec("--render")

bpy.ops.wm.read_factory_settings(use_empty=True)


def yukle(yol, ad):
    onceki = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=yol)
    yeni = [o for o in bpy.data.objects if o not in onceki and o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in yeni:
        o.select_set(True)
    bpy.context.view_layer.objects.active = yeni[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(yeni) > 1:
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = ad
    for k in [x for x in bpy.data.objects if x not in (o,) and x.type != "MESH" and x.name not in ("govde", "kule")]:
        bpy.data.objects.remove(k)
    return o


def seyrelt(o, hedef):
    n = len(o.data.polygons)
    if n > hedef * 1.2:
        mod = o.modifiers.new("seyrelt", "DECIMATE")
        mod.ratio = hedef / n
        mod.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return n


def noktalar(o):
    return [v.co.copy() for v in o.data.vertices]


def kutu(vs):
    return (Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))),
            Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs))))


def hazirla(o, uzunluk_m, on_yonu):
    """Uzun eksen x, ön −x, uzunluk `uzunluk_m`, taban z=0, x/y merkezde."""
    vs = noktalar(o)
    mn, mx = kutu(vs)
    boyut = mx - mn
    if boyut.y > boyut.x:  # uzun eksen y ise x'e çevir
        for v in o.data.vertices:
            v.co = Vector((v.co.y, -v.co.x, v.co.z))
        vs = noktalar(o); mn, mx = kutu(vs); boyut = mx - mn
    if on_yonu == "x+":  # ön +x'teyse 180° çevir → ön −x
        for v in o.data.vertices:
            v.co = Vector((-v.co.x, -v.co.y, v.co.z))
        vs = noktalar(o); mn, mx = kutu(vs)
    olcek = uzunluk_m / (mx.x - mn.x)
    merkez = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    for v in o.data.vertices:
        v.co = (v.co - merkez) * olcek
    o.data.update()
    return noktalar(o)


govde = yukle(govde_yol, "govde")
kule = yukle(kule_yol, "kule")
g_once = seyrelt(govde, int(ucgen * 0.6))
k_once = seyrelt(kule, int(ucgen * 0.4))
gvs = hazirla(govde, govde_boy, on)
kvs = hazirla(kule, kule_boy, kule_on)
gmn, gmx = kutu(gvs)
kmn, kmx = kutu(kvs)
L = gmx.x - gmn.x

# Kule bileziği: gövdenin orta %40'ında (|x| < 0.2 L), |y| < 0.15 L bölgesindeki üst yüzey yüksekliği (ortanca)
orta = [v for v in gvs if abs(v.x) < 0.2 * L and abs(v.y) < 0.15 * L]
ustler = sorted(v.z for v in orta)
bilezik_z = ustler[int(len(ustler) * 0.97)] if ustler else gmx.z
# Bilezik merkezi: gövde ortasından biraz önde (Altay/Leopard: kule hafif önde) → x = −0.05 L
bilezik = Vector((-0.05 * L, 0, bilezik_z - 0.02 * (gmx.z - gmn.z)))

# Kule düğümü: yerel z yukarı, yerel −x ileri → nesne dönüşü X −90°, geometri X +90° ile telafi
duzelt = Matrix.Rotation(math.radians(90), 4, "X")
for v in kule.data.vertices:
    v.co = duzelt @ v.co
kule.data.update()
kule.rotation_euler = (math.radians(-90), 0, 0)
kule.location = bilezik
kule.parent = govde

# Namlu: mantlet = kulenin ön yüzü (x = kmn.x), orta yükseklik; 5,3 m silindir, −x yönünde, 1° yukarı
mantlet = Vector((kmn.x + 0.1 * (kmx.x - kmn.x), 0, kmn.z + 0.45 * (kmx.z - kmn.z)))
namlu_uz, namlu_r = 5.3, 0.075
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=namlu_r, radius2=namlu_r * 1.15, depth=namlu_uz)
# silindir z boyunca; −x'e çevir, 1° yukarı; merkez mantletten yarım uzunluk ileri
bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, "Y") @ Matrix.Rotation(math.radians(-1), 3, "Y"))
bmesh.ops.translate(bm, verts=bm.verts, vec=mantlet + Vector((-namlu_uz / 2, 0, 0)))
me = bpy.data.meshes.new("namlu")
bm.to_mesh(me); bm.free()
mal = bpy.data.materials.new("namlu_mal")
mal.use_nodes = True
b = mal.node_tree.nodes.get("Principled BSDF")
b.inputs["Base Color"].default_value = (0.11, 0.12, 0.08, 1)
b.inputs["Roughness"].default_value = 0.7
me.materials.append(mal)
namlu = bpy.data.objects.new("namlu", me)
bpy.context.scene.collection.objects.link(namlu)
# Namlu kulenin çocuğu: kule düğümü uzayına (düzeltme dönüşü ters) çevir
for v in namlu.data.vertices:
    v.co = duzelt @ v.co
namlu.rotation_euler = (math.radians(-90), 0, 0)
namlu.parent = kule
namlu.matrix_parent_inverse = Matrix.Identity(4)
namlu.location = (0, 0, 0)
namlu.rotation_euler = (0, 0, 0)  # kule uzayında: geometri zaten kule-yerel ile aynı düzeltmede

for im in bpy.data.images:
    if im.size[0] > doku:
        im.scale(doku, doku)

if render:
    bpy.context.view_layer.update()
    uzak = L * 1.6
    kon = Vector((-uzak * 0.7, -uzak * 0.7, govde_boy * 0.5))
    bpy.ops.object.camera_add(location=kon)
    kam = bpy.context.object
    kam.rotation_euler = (Vector((0, 0, 1.5)) - kon).to_track_quat("-Z", "Y").to_euler()
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
for o in (govde, kule, namlu):
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=cikti, export_format="GLB", use_selection=True, export_apply=False,
                          export_image_format="JPEG", export_jpeg_quality=85, export_yup=True, export_animations=False)
print(f"HAZIR {cikti} gövde {g_once}→{len(govde.data.polygons)} kule {k_once}→{len(kule.data.polygons)} bilezik z {bilezik_z:.2f} MB {os.path.getsize(cikti)/1e6:.1f}")
