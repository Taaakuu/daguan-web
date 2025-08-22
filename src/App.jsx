import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export default function App() {
  const mountRef = useRef(null);
  // 【添加】把副作用里的动作暴露给 JSX 按钮调用
  const actionsRef = useRef({ save: null, restore:null, reset:null });
  // 【添加】简单的状态容器：引导剧情步数（不触发 React 重渲染）
  const stateRef = useRef({ questStep: 0 });


  useEffect(() => {
    // 基础三件套
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    // 轻雾：远处稍微雾化，空间更自然
    scene.fog = new THREE.Fog(0x87ceeb, 25, 90);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    (mountRef.current || document.body).appendChild(renderer.domElement);
    // 【添加】让 canvas 可聚焦并自动获取焦点（WASD 需要）
    const canvas = renderer.domElement;
    canvas.setAttribute("tabindex", "0"); // 允许接收键盘事件
    canvas.style.outline = "none";
    canvas.addEventListener("click", () => canvas.focus());

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
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshLambertMaterial({ color: 0x228b22 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.userData.isGround = true;
    ground.receiveShadow = true;
    scene.add(ground);

    // 网格辅助（便于定位）
    const grid =new THREE.GridHelper(120, 120, 0x444444, 0x888888);
    grid.position.y = 0.01; // 避免Z-fighting
    scene.add(grid);

    // 【替换】Day3起：NPC 改为从 /public/npcs.json 加载
    let NPC_DATA = []; // 将在 loadNPCs() 里赋值


    // 【添加】异步加载 NPC 数据并实例化
    async function loadNPCs() {
      // 1) 拉 JSON
      const url = `${import.meta.env.BASE_URL}npcs.json`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
      NPC_DATA = await res.json();

      // 2) 用 JSON 创建 NPC
      NPC_DATA.forEach(({ name, pos, color, lines }) => {
        makeNPC(name, pos[0], pos[1], color, lines, savedByName);
       });
      }
      loadNPCs().catch((e) => {
        console.error("[loadNPCs] failed", e);
        const fallback = [
          { name: "贾宝玉", color: 0xffc0cb, pos: [-3, 0], lines: ["好妹妹，我才不读仕途经济呢", "清风明月，且与我同游。"] },
          { name: "林黛玉", color: 0xc0a0ff, pos: [ 0, 0], lines: ["早知他来，我便不来了", "花谢花飞花满天，你可会作诗？"] },
          { name: "薛宝钗", color: 0xffe08a, pos: [ 3, 0], lines: ["好风凭接力，送我上青云", "稳字当头，事事有度。"] },
        ];
        fallback.forEach(({ name, pos, color, lines }) =>
          makeNPC(name, pos[0], pos[1], color, lines, null)
        );
      });

      // 立柱
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 1.2, 12),
        new THREE.MeshLambertMaterial({ color: 0x8B5A2B })
      );
      pole.position.set(0, 0.6, -4);
      scene.add(pole);  

      // 木牌面
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.6, 0.08),
        new THREE.MeshLambertMaterial({ color: 0xA0522D })
      );
      sign.position.set(0, 1.1, -4);
      scene.add(sign);

      // 供点击拾取的“marker”就用牌面
      const marker = sign;

      // 路标标签（复用 .npc-label 样式）
      const markerLabel = document.createElement("div");
      markerLabel.className = "npc-label";
      markerLabel.innerHTML = `<div class="npc-name">引导路标</div><div class="npc-line">点击我，开始迎宾台词 🌸</div>`;
      document.body.appendChild(markerLabel);


    // ===== NPC 占位柱 =====
    const npcs = [];
    // 替换】多一个 savedByName 参数（可为 null）
    function makeNPC(name, x, z, color, lines, savedByName) {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 1.2, 24),
        new THREE.MeshLambertMaterial({ color })
      );

      // 如果有保存的坐标，用保存的；否则用默认
      const saved = savedByName?.[name];
      mesh.position.set(saved ? saved.x : x, 0.6, saved ? saved.z : z);
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


    // 从 localStorage 读取保存的布局 （按 name 匹配）
    const savedRaw = localStorage.getItem("daguan:npcLayout");
    /** @type {Record<string,{x:number, z:number}>|null} */
    let savedByName = null;
    try{
      const arr = savedRaw ? JSON.parse(savedRaw) : null;
      if (Array.isArray(arr)) {
        savedByName = {};
        arr.forEach((p) => {
          if (p.name && typeof p.x === "number" && typeof p.z === "number") {
            savedByName[p.name] = { x: p.x, z: p.z };
          }
        });
      }
    } catch{}


    // ===== 标签位置投影（把3D位置转换为屏幕像素） =====
    const proj = new THREE.Vector3();
    function updateLabels() {
      const { width, height } = canvas.getBoundingClientRect();
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
      // 【新增】再更新路标标签
      if (marker) {
        const { width, height } = canvas.getBoundingClientRect();
        const v = new THREE.Vector3(marker.position.x, marker.position.y + 0.8, marker.position.z);
        v.project(camera);
        const x = (v.x * 0.5 + 0.5) * width;
        const y = (-v.y * 0.5 + 0.5) * height;
        markerLabel.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
        // 在视野外时隐藏
        markerLabel.style.display = v.z < 1 && v.z > -1 ? "block" : "none";
      }
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
      const rect = canvas.getBoundingClientRect();
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
    // 【添加】检测是否点击到了路标
    function pickMarker(e) {
      setMouse(e);
      raycaster.setFromCamera(mouseNDC, camera);
      const hit = raycaster.intersectObject(marker, false)[0];
      return !!hit;
    }


    function onPointerDown(e) {
      // 【新增】先判断是否点击到路标
      if (pickMarker(e)) {
        stateRef.current.questStep++;
        const introLines = [
          "欢迎来到大观园。这里的一草一木都在等待你的安排。",
          "你可以拖动三位 NPC，也可以按 WASD 漫游四处看看。",
          "接下来，我会引导你走向第一处景观……（明日继续）"
        ];
        const idx = Math.min(stateRef.current.questStep - 1, introLines.length - 1);

        // 把这句引导词显示到所有 NPC 的对话框
        npcs.forEach(n => {
          n.label.querySelector(".npc-line").textContent = introLines[idx];
        });

        toast("迎宾剧情 · 第 " + stateRef.current.questStep + " 步");
        return; // 阻止继续进入 NPC 拖拽逻辑
      }

      const n = pickNPC(e);
      if (!n) return;
      picked = n;
      dragging = true;
      controls.enabled = false;
      canvas.style.cursor = "grabbing";
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
      canvas.style.cursor = "default";
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerUp);

    // ===== WSSD 键盘漫游（沿地面平移相机）=====
    const keys = { w: false, a:false, s:false, d:false };
    const speed = 0.12; //调整移动速度

    const onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (k === "w") keys.w = true;
      if (k === "a") keys.a = true;
      if (k === "s") keys.s = true;
      if (k === "d") keys.d = true;
    };
    const onKeyUp = (e) => {
      const k = e.key.toLowerCase();
      if (k === "w") keys.w = false;
      if (k === "a") keys.a = false;
      if (k === "s") keys.s = false;
      if (k === "d") keys.d = false;
    };
    canvas.addEventListener("keydown", onKeyDown);
    canvas.addEventListener("keyup", onKeyUp);
    function applyWASD() {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      dir.y = 0; dir.normalize();

      const right = new THREE.Vector3()
        .crossVectors(dir, new THREE.Vector3(0, 1, 0))
        .negate();

      const move = new THREE.Vector3();
      if (keys.w) move.add(dir);
      if (keys.s) move.sub(dir);
      if (keys.a) move.sub(right);
      if (keys.d) move.add(right);

      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(speed);
        camera.position.add(move);
        controls.target.add(move); // 保持观察中心
      }
    }

    // ===== 保存布局 / 恢复 / 重置（localStorage) =====
    function saveLayout() {
      const data = npcs.map((n) => ({
        name: n.name,
        x: n.mesh.position.x,
        z: n.mesh.position.z,
      }));
      localStorage.setItem("daguan:npcLayout", JSON.stringify(data));
      toast("布局已保存");
    }

    function restoreLayout() {
      const raw = localStorage.getItem("daguan:npcLayout");
      if (!raw) return toast("还没有保存的布局");
      try{
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return toast("布局数据损坏");
        // 以 name 对齐
        const byName = {};
        arr.forEach((p) => (byName[p.name] = p));
        npcs.forEach((n) => {
          const p = byName[n.name];
          if (p && typeof p.x === "number" && typeof p.z === "number") {
            n.mesh.position.set(p.x, 0.6, p.z);
          }
        });
        toast("布局已恢复");
      } catch {
        toast("布局数据损坏");
      }
    }

    function resetLayout() {
      NPC_DATA.forEach((d, i) => {
        npcs[i].mesh.position.set(d.pos[0], 0.6, d.pos[1]);
      });
      toast("已重置为默认布局");
    }
    actionsRef.current = { save: saveLayout, restore: restoreLayout, reset: resetLayout };


    // 简易 Toast
    const toastEl = document.createElement("div");
    toastEl.className = "toast";
    document.body.appendChild(toastEl);
    let toastTimer = 0;
    function toast(msg) {
      toastEl.textContent = msg;
      toastEl.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1400);
    }


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
      applyWASD(); // 【添加】放在 render 之前
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
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerUp);

      canvas.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("keyup", onKeyUp);
      
      // 移除标签
      canvas.parentNode?.removeChild(canvas);
      npcs.forEach(({ label }) => label.remove());
      toastEl.remove();
      // 移除路标标签
      markerLabel.remove();
    };
  }, []);

  return (
    <>
       <div ref={mountRef} />
      <div className="ui-hint">
        鼠标拖动视角 · 滚轮缩放 · WASD 漫游 · 按住彩色柱子可拖动
      </div>
      <div className="ui-panel">
        <button onClick={() => actionsRef.current.save?.()}>保存布局</button>
        <button onClick={() => actionsRef.current.restore?.()}>恢复布局</button>
        <button onClick={() => actionsRef.current.reset?.()}>重置布局</button>
      </div>
    </>
  );
}