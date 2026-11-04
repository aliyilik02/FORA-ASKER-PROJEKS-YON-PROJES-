"""Tam tank GLB'sini (Meshy) gövde / kule / namlu düğümlerine ayırır (Blender 5.x, başsız):
  blender -b --python araclar/tank-ayir.py -- <tank.glb> <cikti.glb> [--govde-boy 7.7] [--ucgen 60000] [--doku 2048] [--render png]

Oynatıcı sözleşmesi (`figurler3b.ts` kuleyiDondur): manifest `kule`/`namlu` düğüm adları; kule düğümü dönüşsüz, orijini
bilezikte; oynatıcı dönme eksenini dünya yukarısına denk gelen yerel eksenden seçer; −x ileri; namlu kulenin çocuğu.

Ayırma: uzun eksen x'e çevrilir; arka güverte yüksekliği (gövde arka %30'unda dilim tepelerinin ortancası) bulunur;
güvertenin %4 H üstündeki yüzler kule+namlu; namlu = bunlardan gövde burnunun ötesine taşan ya da burnun %8 L
gerisinden öteye uzanan ince kısım; namlunun bulunduğu uç = ön → −x'e çevrilir. Kule orijini kule gövdesinin x/y
merkezinde, güverte yüksekliğinde (dönme ekseni).
"""
import bpy, bmesh, sys, os, math
from mathutils import Vector, Matrix

arg = sys.argv[sys.argv.index("--") + 1:]
girdi, cikti = arg[0], arg[1]
sec = lambda ad, v=None: arg[arg.index(ad) + 1] if ad in arg else v
govde_boy = float(sec("--govde-boy", "7.7")); ucgen = int(sec("--ucgen", "60000")); doku = int(sec("--doku", "2048")); render = sec("--render")

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
tank = bpy.context.view_layer.objects.active
tank.name = "govde"
for o in list(bpy.data.objects):
    if o != tank:
        bpy.data.objects.remove(o)
onceki = len(tank.data.polygons)
if onceki > ucgen * 1.2:
    mod = tank.modifiers.new("seyrelt", "DECIMATE"); mod.ratio = ucgen / onceki; mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)


def vs_():
    return [v.co.copy() for v in tank.data.vertices]


def kutu(vs):
    return (Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))),
            Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs))))


vs = vs_(); mn, mx = kutu(vs); boyut = mx - mn
if boyut.y > boyut.x:
    for v in tank.data.vertices:
        v.co = Vector((v.co.y, -v.co.x, v.co.z))
    vs = vs_(); mn, mx = kutu(vs); boyut = mx - mn
L, H, W = boyut.x, boyut.z, boyut.y
dilim = 20
tepe = [-1e9] * dilim; taban = [1e9] * dilim; sayi = [0] * dilim
for v in vs:
    d = min(dilim - 1, int((v.x - mn.x) / L * dilim))
    tepe[d] = max(tepe[d], v.z); taban[d] = min(taban[d], v.z); sayi[d] += 1
# Namlu ucu: dik kesiti çok küçük olan uç dilimler (namlu gövde ötesine taşar) → o taraf ön
def kesit(d):
    sec_v = [v for v in vs if min(dilim - 1, int((v.x - mn.x) / L * dilim)) == d]
    if not sec_v: return 0.0
    k0, k1 = kutu(sec_v); return (k1.y - k0.y) * (k1.z - k0.z)
on_isaret = -1 if kesit(0) < kesit(dilim - 1) else 1  # −1: ön zaten −x tarafında
if on_isaret > 0:  # ön +x'te → çevir
    for v in tank.data.vertices:
        v.co = Vector((-v.co.x, -v.co.y, v.co.z))
    vs = vs_(); mn, mx = kutu(vs)
    tepe.reverse(); taban.reverse(); sayi.reverse()
# Gövde burnu: kesiti gövde kesitine yakın ilk dilim (namlu dilimleri atlanır)
ortaKesit = sorted(kesit(d) for d in range(dilim // 3, 2 * dilim // 3))[dilim // 6]
burun_d = 0
for d in range(dilim):
    if kesit(d) > 0.25 * ortaKesit:
        burun_d = d; break
burun_x = mn.x + (burun_d + 0.2) / dilim * L
govde_L = mx.x - burun_x
# Güverte: gövdenin arka dış köşelerindeki (x arka %30, |y| > %30 W) tepe yüksekliklerinin ortancası — kule kuyruğu
# gövdeden dardır, anten ortadadır; genişlik profili ve dilim tepeleri bu modelde yanıltıyordu
W = mx.y - mn.y
kenar = [v.z for v in vs if v.x > mx.x - 0.3 * govde_L and abs(v.y) > 0.3 * W]
hucre = {}
for v in vs:
    if v.x > mx.x - 0.3 * govde_L and abs(v.y) > 0.3 * W:
        anahtar = (int((v.x - mn.x) / L * 40), int((v.y - mn.y) / W * 20))
        hucre[anahtar] = max(hucre.get(anahtar, -1e9), v.z)
tepeler = sorted(hucre.values())
guverte = tepeler[len(tepeler) // 2] if tepeler else mn.z + 0.6 * H
esik = guverte + 0.02 * H
print(f"L {L:.2f} H {H:.2f} ön {'−x' if on_isaret < 0 else '+x→çevrildi'} burun x {burun_x:.2f} gövde L {govde_L:.2f} güverte z {guverte:.2f}")

# Ölçek: gövde uzunluğu govde_boy; taban z=0; x/y merkezi gövde merkezinde
olcek = govde_boy / govde_L
merkez = Vector(((burun_x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
for v in tank.data.vertices:
    v.co = (v.co - merkez) * olcek
tank.data.update()
vs = vs_(); mn, mx = kutu(vs)
burun_x = (burun_x - merkez.x) * olcek; guverte = (guverte - merkez.z) * olcek; esik = (esik - merkez.z) * olcek; H *= olcek

# Yüz seçimi
bm = bmesh.new(); bm.from_mesh(tank.data); bm.faces.ensure_lookup_table()
kule_f, namlu_f = [], []
for f in bm.faces:
    zs = [v.co.z for v in f.verts]; xs = [v.co.x for v in f.verts]
    if min(zs) > esik:
        if max(xs) < burun_x + 0.08 * govde_boy:
            namlu_f.append(f)
        else:
            kule_f.append(f)
# Namlu: kule yüzlerinden, namlu ekseni çevresinde ince ve ileri uzanan parçalar da (burun gerisi) — kule gövdesinin
# önündeki ince yüzler: y genişliği küçük (< 0.08 W) ve x < kule bulk ön kenarı
if kule_f:
    kx = sorted(v.co.x for f in kule_f for v in f.verts)
    kule_on_x = kx[int(len(kx) * 0.05)]
    ek = [f for f in kule_f if max(v.co.x for v in f.verts) < kule_on_x + 0.02 * govde_boy and all(abs(v.co.y) < 0.12 * (mx.y - mn.y) for v in f.verts)]
    for f in ek:
        kule_f.remove(f); namlu_f.append(f)
for f in bm.faces:
    f.select = False
for f in namlu_f:
    f.select = True
bm.to_mesh(tank.data); bm.free()
print(f"kule yüz {len(kule_f)} namlu yüz {len(namlu_f)} / {len(tank.data.polygons)}")
bpy.context.view_layer.objects.active = tank
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.separate(type="SELECTED"); bpy.ops.object.mode_set(mode="OBJECT")
namlu = next(o for o in bpy.data.objects if o.type == "MESH" and o != tank)
namlu.name = "namlu"
# Kule
bm = bmesh.new(); bm.from_mesh(tank.data); bm.faces.ensure_lookup_table()
for f in bm.faces:
    zs = [v.co.z for v in f.verts]
    f.select = min(zs) > esik
bm.to_mesh(tank.data); bm.free()
bpy.ops.object.select_all(action="DESELECT"); tank.select_set(True); bpy.context.view_layer.objects.active = tank
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.separate(type="SELECTED"); bpy.ops.object.mode_set(mode="OBJECT")
kule = next(o for o in bpy.data.objects if o.type == "MESH" and o not in (tank, namlu))
kule.name = "kule"
kvs = [v.co.copy() for v in kule.data.vertices]
kmn, kmx = kutu(kvs)
pivot = Vector(((kmn.x + kmx.x) / 2, (kmn.y + kmx.y) / 2, guverte))
# Kule/namlu düğümleri dönüşsüz (glTF dışa aktarımı nesne dönüşünü güvenilir taşımıyordu); orijin pivotta.
# Oynatıcı (figurler3b.ts kuleyiDondur) dönme eksenini düğümün dünya yukarısına denk gelen yerel ekseninden seçer.
for o in (kule, namlu):
    for v in o.data.vertices:
        v.co = v.co - pivot
    o.data.update()
kule.location = pivot
kule.parent = tank
namlu.parent = kule
namlu.matrix_parent_inverse = Matrix.Identity(4)
namlu.location = (0, 0, 0)

for im in bpy.data.images:
    if im.size[0] > doku:
        im.scale(doku, doku)

if render:
    bpy.context.view_layer.update()
    uzak = govde_boy * 1.7
    kon = Vector((-uzak * 0.7, -uzak * 0.7, govde_boy * 0.45))
    bpy.ops.object.camera_add(location=kon)
    kam = bpy.context.object
    kam.rotation_euler = (Vector((0, 0, 1.3)) - kon).to_track_quat("-Z", "Y").to_euler()
    sc = bpy.context.scene; sc.camera = kam
    sc.render.resolution_x, sc.render.resolution_y = 900, 560
    sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.light = "STUDIO"; sc.display.shading.color_type = "TEXTURE"
    sc.render.filepath = render
    bpy.ops.render.render(write_still=True)
    # kule 35° dönmüş ikinci kare: ayrımı ve pivotu gösterir
    kule.rotation_euler = (0, 0, math.radians(35))
    bpy.context.view_layer.update()
    sc.render.filepath = render.replace(".png", "_kule35.png")
    bpy.ops.render.render(write_still=True)
    kule.rotation_euler = (0, 0, 0)
    bpy.data.objects.remove(kam)

bpy.ops.object.select_all(action="DESELECT")
for o in (tank, kule, namlu):
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=cikti, export_format="GLB", use_selection=True, export_apply=False,
                          export_image_format="JPEG", export_jpeg_quality=85, export_yup=True, export_animations=False)
print(f"HAZIR {cikti} üçgen {onceki}→{len(tank.data.polygons)}+{len(kule.data.polygons)}+{len(namlu.data.polygons)} MB {os.path.getsize(cikti)/1e6:.1f}")
