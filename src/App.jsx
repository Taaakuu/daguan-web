import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export default function App() {
  const mountRef = useRef(null);

  useEffect(() => {
    // 基础三件套
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    (mountRef.current || document.body).appendChild(renderer.domElement);

    // 轨道控制
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 0);

    // 光照 & 地面
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight, new THREE.AmbientLight(0xffffff, 0.3));

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(50, 50),
      new THREE.MeshLambertMaterial({ color: 0x228b22 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.userData.isGround = true;
    scene.add(ground);

    // ===== NPC 占位柱 =====
    const npcs = [];
    function makeNPC(name, x, z, color, lines) {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 1.2, 24),
        new THREE.MeshLambertMaterial({ color })
      );
      mesh.position.set(x, 0.6, z);
      mesh.userData.npc = name;
      scene.add(mesh);

      // 创建悬浮标签（名字+台词）
      const label = document.createElement("div");
      label.className = "npc-label";
      label.innerHTML = `<div class="npc-name">${name}</div><div class="npc-line"></div>`;
      document.body.appendChild(label);

      const data = { name, mesh, label, lines, lineIndex: 0 };
      label.querySelector(".npc-line").textContent = lines[0] || "……";
      npcs.push(data);
      return data;
    }

    const NPC_DATA = [
      {
        name: "贾宝玉",
        pos: [-3, 0],
        color: 0xffc0cb,
        lines: ["好妹妹，我才不读仕途经济呢"],
      },
      {
        name: "林黛玉",
        pos: [0, 0],
        color: 0xc0a0ff,
        lines: ["早知他来，我便不来了"],
      },
      {
        name: "薛宝钗",
        pos: [3, 0],
        color: 0xffe08a,
        lines: ["好风凭接力，送我上青云"],
      },
    ];

    NPC_DATA.forEach(({ name, pos, color, lines }) => makeNPC(name, pos[0], pos[1], color, lines));

    // ===== 标签位置投影（把3D位置转换为屏幕像素） =====
    const proj = new THREE.Vector3();
    function updateLabels() {
      const { width, height } = renderer.domElement.getBoundingClientRect();
      npcs.forEach(({ mesh, label }) => {
        proj.copy(mesh.position);
        proj.y += 1.1; // 标签悬浮到柱子上方一点
        proj.project(camera);
        const x = (proj.x * 0.5 + 0.5) * width;
        const y = (-proj.y * 0.5 + 0.5) * height;
        label.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
        // 在视野外时隐藏
        label.style.display = proj.z < 1 && proj.z > -1 ? "block" : "none";
      });
    }

    // ===== 台词自动轮换（每 4 秒切换一次） =====
    const lineTimer = setInterval(() => {
      npcs.forEach((n) => {
        if (!n.lines?.length) return;
        n.lineIndex = (n.lineIndex + 1) % n.lines.length;
        n.label.querySelector(".npc-line").textContent = n.lines[n.lineIndex];
      });
    }, 4000);

    // ===== 拖拽：按住 NPC 在地面上移动（点击=拖拽起手，不弹窗） =====
    const raycaster = new THREE.Raycaster();
    const mouseNDC = new THREE.Vector2();
    let dragging = false;
    let picked = null;

    function setMouse(e) {
      const rect = renderer.domElement.getBoundingClientRect();
      mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function intersectGround() {
      raycaster.setFromCamera(mouseNDC, camera);
      const hit = raycaster.intersectObject(ground, false)[0];
      return hit?.point || null;
    }

    function pickNPC(e) {
      setMouse(e);
      raycaster.setFromCamera(mouseNDC, camera);
      // 只查 mesh 列表
      const meshes = npcs.map((n) => n.mesh);
      const hit = raycaster.intersectObjects(meshes, false)[0];
      if (!hit) return null;
      return npcs.find((n) => n.mesh === hit.object) || null;
    }

    function onPointerDown(e) {
      const n = pickNPC(e);
      if (!n) return;
      picked = n;
      dragging = true;
      controls.enabled = false;
      renderer.domElement.style.cursor = "grabbing";
    }

    function onPointerMove(e) {
      if (!dragging || !picked) return;
      setMouse(e);
      const p = intersectGround();
      if (p) {
        picked.mesh.position.set(p.x, 0.6, p.z);
      }
    }

    function onPointerUp() {
      dragging = false;
      picked = null;
      controls.enabled = true;
      renderer.domElement.style.cursor = "default";
    }

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointerleave", onPointerUp);

    // 自适应
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      updateLabels();
    };
    window.addEventListener("resize", onResize);

    // 渲染循环
    let raf;
    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      updateLabels();
      raf = requestAnimationFrame(loop);
    };
    loop();

    // 清理
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(lineTimer);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointerleave", onPointerUp);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.parentNode?.removeChild(renderer.domElement);
      // 移除标签
      npcs.forEach(({ label }) => label.remove());
    };
  }, []);

  return (
    <>
      <div ref={mountRef} />
      <div className="ui-hint">提示：鼠标拖动视角；按住彩色柱子可在地面上拖动；名字与台词始终显示</div>
    </>
  );
}
