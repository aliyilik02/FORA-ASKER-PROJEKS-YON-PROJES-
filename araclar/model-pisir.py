"""Meshy GLB'sini sadeleştirip dokusunu yeni UV'ye pişirir (Blender 5.x, başsız):
  blender -b --factory-startup --python araclar/model-pisir.py -- <girdi.glb> <cikti.glb> --ucgen 6000 [--doku 1024] [--normal]

Neden: Meshy topluluk modellerinin doku atlası binlerce küçük UV adasından oluşur; meshoptimizer dikiş kenarlarını
çökertemediği için 1,6 milyon üçgenlik ağaç 570 binde takılıyor, Blender Decimate de UV'yi yırtıp "kırık porselen"
görüntüsü veriyordu. Burada kopyada önce aynı konumdaki köşeler birleşir (UV köşe başına durduğu için kaybolmaz),
Decimate (Collapse) hedef üçgene iner, yeni UV açılır ve renk (isteğe bağlı normal) özgün modelden pişirilir
(Cycles, seçiliden etkine). Çıktı özgün ölçekte; ölçek/taban için ardından model-sadelestir.mjs çalışır
(alan-modelleri-hazirla.mjs, yapılandırmada "pisir": true).
"""
import bpy, sys, math, os

arg = sys.argv[sys.argv.index("--") + 1:]
girdi, cikti = arg[0], arg[1]


def secenek(ad, varsayilan=None):
    return arg[arg.index(ad) + 1] if ad in arg else varsayilan


ucgen = int(secenek("--ucgen", "6000"))
doku = int(secenek("--doku", "1024"))
normal_pisir = "--normal" in arg
# Bina/araç: hacimden yeniden ağ (voksel) pencere ve kenarları eritir; Decimate hedefe inemezse olduğu gibi kalır
voksel_yok = "--voksel-yok" in arg
# Yumuşatma açısı (derece): sadeleştirmeden sonra açı sınırlı yumuşak gölge. Yoksa ağ UV adalarında parçalanıp düz
# gölgeli çıkıyordu (köşe/üçgen = 3,00; ağaçlarda "kristal" görüntü, 10 Kasım). Duvar köşesi (90°) keskin kalır.
yumusatma_acisi = float(secenek("--aci", "40"))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=girdi)

# Bütün mesh'ler tek nesne (dönüşümler uygulanmış)
meshler = [o for o in bpy.context.scene.objects if o.type == "MESH"]
bpy.ops.object.select_all(action="DESELECT")
for o in meshler:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshler[0]
bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
if len(meshler) > 1:
    bpy.ops.object.join()
yuksek = bpy.context.view_layer.objects.active
for o in list(bpy.context.scene.objects):
    if o.type != "MESH":
        bpy.data.objects.remove(o, do_unlink=True)

boyut = max(yuksek.dimensions)


def ucgen_sayisi(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


once = ucgen_sayisi(yuksek)

# Alçak kopya: köşe birleştir → Decimate (gerekirse iki tur)
alcak = yuksek.copy()
alcak.data = yuksek.data.copy()
bpy.context.collection.objects.link(alcak)
bpy.ops.object.select_all(action="DESELECT")
alcak.select_set(True)
bpy.context.view_layer.objects.active = alcak
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.remove_doubles(threshold=boyut * 2e-5)
bpy.ops.object.mode_set(mode="OBJECT")
def sadelestir(o):
    for _ in range(6):
        simdi = ucgen_sayisi(o)
        if simdi <= ucgen * 1.15:
            break
        m = o.modifiers.new("sadelestir", "DECIMATE")
        m.decimate_type = "COLLAPSE"
        m.ratio = max(0.0005, ucgen / simdi)
        m.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=m.name)


sadelestir(alcak)
yontem = "decimate"
# Binlerce ayrık parçalı (yaprak kümesi, iğne) modelde Decimate parça başına birkaç üçgende takılır: hacimden yeniden ağ
# (voksel; ince dallar kalınlaşır, yaprak arası boşluk dolar, renk yine pişirilir) ve onun sadeleştirilmesi
if ucgen_sayisi(alcak) > ucgen * 1.6 and not voksel_yok:
    alcak.modifiers.clear()
    alcak.data = yuksek.data.copy()
    v = alcak.modifiers.new("hacim", "REMESH")
    v.mode = "VOXEL"
    v.voxel_size = boyut / (40 if ucgen <= 1500 else 120)
    v.adaptivity = 0.0
    bpy.ops.object.modifier_apply(modifier=v.name)
    sadelestir(alcak)
    yontem = "voksel"
sonra = ucgen_sayisi(alcak)

# Açı sınırlı yumuşak gölge (normal pişirmesi de bu normallere göre: düz gölge + normal haritası değil)
bpy.ops.object.select_all(action="DESELECT")
alcak.select_set(True)
bpy.context.view_layer.objects.active = alcak
try:
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(yumusatma_acisi))
except Exception:
    bpy.ops.object.shade_smooth()

# Yeni UV (eski katmanlar silinir: pişirme yeni UV'ye)
while alcak.data.uv_layers:
    alcak.data.uv_layers.remove(alcak.data.uv_layers[0])
alcak.data.uv_layers.new(name="UVMap")
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
bpy.ops.object.mode_set(mode="OBJECT")

# Pişirme hedefi malzemesi
mal = bpy.data.materials.new("pisirilmis")
mal.use_nodes = True
nt = mal.node_tree
bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
bsdf.inputs["Roughness"].default_value = 0.9
bsdf.inputs["Metallic"].default_value = 0.0
renk = bpy.data.images.new("renk", doku, doku, alpha=False)
renk_dugum = nt.nodes.new("ShaderNodeTexImage")
renk_dugum.image = renk
alcak.data.materials.clear()
alcak.data.materials.append(mal)

sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
sc.cycles.samples = 2
bake = sc.render.bake
bake.use_selected_to_active = True
bake.cage_extrusion = boyut * 0.015
bake.max_ray_distance = boyut * (0.15 if yontem == "voksel" else 0.05)
bake.margin = 6
bpy.ops.object.select_all(action="DESELECT")
yuksek.select_set(True)
alcak.select_set(True)
bpy.context.view_layer.objects.active = alcak

nt.nodes.active = renk_dugum
bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"})

if normal_pisir:
    nrm = bpy.data.images.new("normal", doku, doku, alpha=False)
    nrm.colorspace_settings.name = "Non-Color"
    nrm_dugum = nt.nodes.new("ShaderNodeTexImage")
    nrm_dugum.image = nrm
    nt.nodes.active = nrm_dugum
    bpy.ops.object.bake(type="NORMAL", normal_space="TANGENT")
    harita = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(nrm_dugum.outputs["Color"], harita.inputs["Color"])
    nt.links.new(harita.outputs["Normal"], bsdf.inputs["Normal"])
# Görüntü pişirmeden sonra bağlanır (önce bağlı olsaydı hedef görüntü kendi girdisi olurdu: "döngüsel bağımlılık")
nt.links.new(renk_dugum.outputs["Color"], bsdf.inputs["Base Color"])
alcak.data.validate()

# Görüntüleri pakete al, özgünü sil, yalnız alçak kopyayı yaz
for img in [i for i in bpy.data.images if i.name in ("renk", "normal")]:
    img.pack()
bpy.data.objects.remove(yuksek, do_unlink=True)
bpy.ops.export_scene.gltf(filepath=cikti, export_format="GLB", export_image_format="JPEG", export_jpeg_quality=88, export_apply=True)
print(f"PISIRILDI {os.path.basename(cikti)} üçgen {once} → {sonra} ({yontem}) doku {doku}{' + normal' if normal_pisir else ''}")
