/** Üst/alt gövde katman klipleri (D-22): izler kemik adına göre ayrılır, rig tanınmazsa null, sonuç önbellekli. */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { altGovdeKlibi, ustGovdeKlibi } from "./figurler3b";

function iz(ad: string) {
  return new THREE.QuaternionKeyframeTrack(`${ad}.quaternion`, [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]);
}
const MIXAMO = ["mixamorigHips", "mixamorigSpine", "mixamorigSpine1", "mixamorigNeck", "mixamorigHead", "mixamorigLeftShoulder", "mixamorigLeftArm", "mixamorigLeftForeArm", "mixamorigLeftHand", "mixamorigLeftUpLeg", "mixamorigLeftLeg", "mixamorigLeftFoot", "mixamorigRightUpLeg", "mixamorigRightLeg"];

describe("gövde katman klipleri", () => {
  it("Mixamo rig: üst klip omurga/baş/kol izleri, alt klip kalça/bacak izleri; kümeler ayrık ve tam", () => {
    const klip = new THREE.AnimationClip("Firing Rifle", 1, [...MIXAMO.map(iz), new THREE.VectorKeyframeTrack("mixamorigHips.position", [0, 1], [0, 0, 0, 0, 0, 0])]);
    const ust = ustGovdeKlibi(klip)!;
    const alt = altGovdeKlibi(klip)!;
    expect(ust.name).toBe("Firing Rifle|ust");
    const ustAdlar = ust.tracks.map((t) => t.name);
    const altAdlar = alt.tracks.map((t) => t.name);
    expect(ustAdlar).toContain("mixamorigSpine.quaternion");
    expect(ustAdlar).toContain("mixamorigLeftHand.quaternion");
    expect(ustAdlar).not.toContain("mixamorigHips.quaternion");
    expect(altAdlar).toContain("mixamorigLeftUpLeg.quaternion");
    expect(altAdlar).toContain("mixamorigHips.position");
    expect(ustAdlar.filter((a) => altAdlar.includes(a))).toEqual([]);
    expect(ust.tracks.length + alt.tracks.length).toBe(klip.tracks.length);
    expect(ustGovdeKlibi(klip)).toBe(ust); // önbellek
  });
  it("tanınmayan rig (yetersiz üst ya da alt iz) → null", () => {
    expect(ustGovdeKlibi(new THREE.AnimationClip("x", 1, ["Bone1", "Bone2", "Bone3", "Bone4"].map(iz)))).toBeNull();
    expect(altGovdeKlibi(new THREE.AnimationClip("y", 1, ["Spine", "Neck", "Head", "LeftArm"].map(iz)))).toBeNull();
  });
});
