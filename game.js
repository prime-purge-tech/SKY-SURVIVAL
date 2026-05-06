import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ========== VARIABLES GLOBALES ==========
let scene, camera, renderer, effectComposer;
let gameActive = false;
let animationId = null;

// État du joueur
let health = 100;
let armor = 0;
let hunger = 80;
let thirst = 80;

// Armes
let currentWeapon = 0;
const weapons = [
    { name: "M4A1", damage: 34, ammo: 30, maxAmmo: 90, fireRate: 120 },
    { name: "SNIPER", damage: 75, ammo: 8, maxAmmo: 24, fireRate: 800 }
];
let currentAmmo = weapons[0].ammo;
let reserveAmmo = weapons[0].maxAmmo - weapons[0].ammo;
let canShoot = true;
let reloading = false;

// Contrôles
let keyState = { w: false, s: false, a: false, d: false, shift: false };
let yaw = -Math.PI / 4, pitch = 0;
let moveSpeed = 5.5;
let mouseLocked = false;

// Entités
let enemies = [];
let friendlies = [];
let neutralMask = null;
let controlledMinions = [];
let items = [];

// Interface
let bloodIntensity = 0;
let lastHitTime = 0;

// ========== INITIALISATION 3D ==========
function initGame3D() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a1030);
    scene.fog = new THREE.FogExp2(0x0a1030, 0.002);
    
    camera = new THREE.PerspectiveCamera(85, window.innerWidth / window.innerHeight, 0.05, 500);
    camera.position.set(0, 1.7, 0);
    
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    
    effectComposer = new EffectComposer(renderer);
    effectComposer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.6, 0.3, 0.2);
    effectComposer.addPass(bloomPass);
    
    // Terrain
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a6b2f, roughness: 0.7 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(250, 250), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.7;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // Arbres
    for (let i = 0; i < 300; i++) {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 1.5, 5), new THREE.MeshStandardMaterial({ color: 0x8B5A2B }));
        trunk.position.set((Math.random() - 0.5) * 230, -0.6, (Math.random() - 0.5) * 230);
        trunk.castShadow = true;
        scene.add(trunk);
    }
    
    // Lumières
    const sun = new THREE.DirectionalLight(0xffeedd, 1.2);
    sun.position.set(30, 50, 20);
    sun.castShadow = true;
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0x404060));
    
    spawnCharacters();
    spawnItems();
}

// ========== CRÉATION DES PERSONNAGES ==========
function createCharacter(x, z, type, profession = null) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.2, 0.6), new THREE.MeshStandardMaterial({ color: 0x6a5a4a }));
    body.position.y = 0.6;
    group.add(body);
    
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 24), new THREE.MeshStandardMaterial({ color: 0xddbb99 }));
    head.position.y = 1.25;
    group.add(head);
    
    // Masque texturé
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f5e6d3';
    ctx.fillRect(0, 0, 128, 128);
    
    if (type === 'enemy') {
        ctx.fillStyle = '#000';
        ctx.font = 'bold 50px Arial';
        ctx.fillText("☹️", 35, 85);
    } else if (type === 'friendly') {
        ctx.fillStyle = '#228822';
        ctx.font = 'bold 50px Arial';
        ctx.fillText("😊", 35, 85);
    } else {
        ctx.fillStyle = '#aa8844';
        ctx.font = 'bold 45px Arial';
        ctx.fillText("🎭", 35, 85);
    }
    
    const maskTex = new THREE.CanvasTexture(canvas);
    const mask = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.1), new THREE.MeshStandardMaterial({ map: maskTex }));
    mask.position.set(0, 1.25, 0.45);
    group.add(mask);
    
    group.position.set(x, -0.5, z);
    scene.add(group);
    
    return {
        mesh: group,
        type: type,
        health: 80,
        speed: 2.5,
        profession: profession
    };
}

function spawnCharacters() {
    for (let i = 0; i < 12; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 30 + Math.random() * 80;
        enemies.push(createCharacter(Math.cos(angle) * radius, Math.sin(angle) * radius, 'enemy', null));
    }
    
    for (let i = 0; i < 5; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 20 + Math.random() * 60;
        friendlies.push(createCharacter(Math.cos(angle) * radius, Math.sin(angle) * radius, 'friendly', null));
    }
    
    neutralMask = createCharacter(45, 45, 'neutral', null);
}

function spawnItems() {
    const itemMat = new THREE.MeshStandardMaterial({ color: 0xffaa66 });
    for (let i = 0; i < 40; i++) {
        const item = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), itemMat);
        item.position.set((Math.random() - 0.5) * 200, -0.4, (Math.random() - 0.5) * 200);
        scene.add(item);
        items.push({ mesh: item, type: 'food', value: 20 });
    }
}

// ========== MISE À JOUR UI ==========
function updateHUD() {
    document.getElementById('healthBarFill').style.width = `${Math.max(0, health)}%`;
    document.getElementById('healthText').innerHTML = Math.floor(health);
    document.getElementById('armorBarFill').style.width = `${armor}%`;
    document.getElementById('armorText').innerHTML = armor;
    document.getElementById('hungerStat').style.width = `${hunger}%`;
    document.getElementById('thirstStat').style.width = `${thirst}%`;
    document.getElementById('weaponNameDisplay').innerHTML = weapons[currentWeapon].name;
    document.getElementById('ammoDisplay').innerHTML = `${currentAmmo}<span>/${reserveAmmo + currentAmmo}</span>`;
    
    // Effet de sang
    const bloodDiv = document.getElementById('bloodEffect');
    if (health < 40) {
        bloodDiv.style.opacity = 0.3 + (40 - health) / 100;
    } else {
        bloodDiv.style.opacity = Math.max(0, bloodDiv.style.opacity - 0.05);
    }
}

function showNotification(msg, isBad = false) {
    const area = document.getElementById('notificationArea');
    const notif = document.createElement('div');
    notif.className = 'notification';
    notif.innerHTML = msg;
    notif.style.borderLeftColor = isBad ? '#ff4444' : '#44ff44';
    area.appendChild(notif);
    setTimeout(() => notif.remove(), 2500);
}

function addKillFeed(msg) {
    const killfeed = document.getElementById('killfeed');
    const entry = document.createElement('div');
    entry.className = 'kill-entry';
    entry.innerHTML = msg;
    killfeed.appendChild(entry);
    setTimeout(() => entry.remove(), 3500);
}

// ========== MÉCANIQUES DE JEU ==========
function shoot() {
    if (!gameActive || reloading || !canShoot || currentAmmo <= 0) {
        if (currentAmmo <= 0) showNotification("🔫 Plus de munitions ! Recharge", true);
        return;
    }
    canShoot = false;
    currentAmmo--;
    updateHUD();
    
    // Raycaster
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const allMeshes = [...enemies, ...friendlies].map(e => e.mesh);
    const intersects = raycaster.intersectObjects(allMeshes);
    
    if (intersects.length > 0) {
        const hit = intersects[0].object;
        const enemy = enemies.find(e => e.mesh === hit);
        if (enemy) {
            enemy.health -= weapons[currentWeapon].damage;
            addKillFeed(`🔥 Vous avez blessé un ennemi !`);
            if (enemy.health <= 0) {
                scene.remove(enemy.mesh);
                enemies = enemies.filter(e => e !== enemy);
                addKillFeed(`💀 Ennemi éliminé +20 nourriture`);
                hunger = Math.min(100, hunger + 20);
                updateHUD();
            }
        }
    }
    
    setTimeout(() => { canShoot = true; }, weapons[currentWeapon].fireRate);
}

function reload() {
    if (reloading || currentAmmo === weapons[currentWeapon].maxAmmo) return;
    reloading = true;
    showNotification("⟳ Rechargement...");
    setTimeout(() => {
        const needed = weapons[currentWeapon].maxAmmo - currentAmmo;
        const take = Math.min(needed, reserveAmmo);
        currentAmmo += take;
        reserveAmmo -= take;
        reloading = false;
        updateHUD();
        showNotification("✔️ Rechargé");
    }, 1600);
}

// ========== IA ENNEMIS ==========
function updateAI(delta) {
    for (let enemy of enemies) {
        const dir = new THREE.Vector3().subVectors(camera.position, enemy.mesh.position).normalize();
        enemy.mesh.position.x += dir.x * enemy.speed * delta;
        enemy.mesh.position.z += dir.z * enemy.speed * delta;
        enemy.mesh.lookAt(camera.position);
        
        if (enemy.mesh.position.distanceTo(camera.position) < 1.3) {
            health = Math.max(0, health - 12 * delta);
            bloodIntensity = 0.5;
            lastHitTime = Date.now();
            updateHUD();
            if (health <= 0) {
                showNotification("💀 GAME OVER - Rafraîchis", true);
                gameActive = false;
            }
        }
    }
}

// ========== INTERACTIONS ==========
function handleInteractions() {
    // Gentils
    for (let i = 0; i < friendlies.length; i++) {
        if (camera.position.distanceTo(friendlies[i].mesh.position) < 2) {
            hunger = Math.min(100, hunger + 35);
            thirst = Math.min(100, thirst + 35);
            showNotification("🎁 Un gentil t'a donné des provisions !");
            scene.remove(friendlies[i].mesh);
            friendlies.splice(i, 1);
            updateHUD();
            i--;
        }
    }
    
    // Masque neutre
    if (neutralMask && camera.position.distanceTo(neutralMask.mesh.position) < 2.5) {
        showNotification("🎭 Masque neutre trouvé ! 3 méchants sous ton contrôle !");
        for (let i = 0; i < Math.min(3, enemies.length); i++) {
            controlledMinions.push(enemies[i]);
            enemies[i].mesh.children.forEach(c => { if (c.isMesh) c.material.emissiveIntensity = 0.5; });
        }
        scene.remove(neutralMask.mesh);
        neutralMask = null;
    }
    
    // Items
    for (let i = 0; i < items.length; i++) {
        if (camera.position.distanceTo(items[i].mesh.position) < 1.2) {
            hunger = Math.min(100, hunger + items[i].value);
            showNotification(`🍎 +${items[i].value} nourriture`);
            scene.remove(items[i].mesh);
            items.splice(i, 1);
            updateHUD();
            i--;
        }
    }
}

// ========== CONTRÔLES ==========
function initControls() {
    document.addEventListener('keydown', (e) => {
        if (!gameActive) return;
        switch(e.code) {
            case 'KeyW': keyState.w = true; break;
            case 'KeyS': keyState.s = true; break;
            case 'KeyA': keyState.a = true; break;
            case 'KeyD': keyState.d = true; break;
            case 'ShiftLeft': keyState.shift = true; moveSpeed = 9.0; break;
            case 'KeyR': reload(); break;
            case 'Digit1': currentWeapon = 0; updateHUD(); showNotification(`🔁 ${weapons[0].name}`); break;
            case 'Digit2': currentWeapon = 1; updateHUD(); showNotification(`🔁 ${weapons[1].name}`); break;
        }
    });
    
    document.addEventListener('keyup', (e) => {
        switch(e.code) {
            case 'KeyW': keyState.w = false; break;
            case 'KeyS': keyState.s = false; break;
            case 'KeyA': keyState.a = false; break;
            case 'KeyD': keyState.d = false; break;
            case 'ShiftLeft': keyState.shift = false; moveSpeed = 5.5; break;
        }
    });
    
    document.addEventListener('mousemove', (e) => {
        if (mouseLocked && gameActive) {
            yaw -= e.movementX * 0.002;
            pitch -= e.movementY * 0.002;
            pitch = Math.max(-Math.PI / 2.3, Math.min(Math.PI / 2.3, pitch));
            camera.rotation.order = 'YXZ';
            camera.rotation.y = yaw;
            camera.rotation.x = pitch;
        }
    });
    
    renderer.domElement.addEventListener('click', () => {
        if (gameActive) renderer.domElement.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
        mouseLocked = document.pointerLockElement === renderer.domElement;
    });
    document.addEventListener('mousedown', (e) => {
        if (mouseLocked && gameActive && e.button === 0) shoot();
    });
    
    // Boutons tactiles
    document.getElementById('fireBtn').addEventListener('click', () => { if (gameActive) shoot(); });
    document.getElementById('reloadBtn').addEventListener('click', () => { if (gameActive) reload(); });
    document.getElementById('weaponSwitchBtn').addEventListener('click', () => {
        currentWeapon = (currentWeapon + 1) % weapons.length;
        updateHUD();
        showNotification(`🔁 ${weapons[currentWeapon].name}`);
    });
}

function updateMovement(delta) {
    if (!gameActive) return;
    const speed = moveSpeed * delta;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    let move = new THREE.Vector3(0, 0, 0);
    if (keyState.w) move.z -= 1;
    if (keyState.s) move.z += 1;
    if (keyState.a) move.x -= 1;
    if (keyState.d) move.x += 1;
    move.normalize();
    camera.position.x += (move.x * right.x + move.z * forward.x) * speed;
    camera.position.z += (move.x * right.z + move.z * forward.z) * speed;
    camera.position.y = 1.7;
    
    const limit = 110;
    camera.position.x = Math.max(-limit, Math.min(limit, camera.position.x));
    camera.position.z = Math.max(-limit, Math.min(limit, camera.position.z));
}

// ========== TRANSITIONS ==========
function startGame() {
    const lobby = document.getElementById('lobbyScreen');
    const loading = document.getElementById('loadingScreen');
    const gameContainer = document.getElementById('gameContainer');
    
    lobby.style.display = 'none';
    loading.style.display = 'flex';
    
    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress >= 100) {
            clearInterval(interval);
            loading.style.display = 'none';
            gameContainer.style.display = 'block';
            gameActive = true;
            initGame3D();
            initControls();
            animate();
            showNotification("Bienvenue en zone de guerre !");
        }
        document.getElementById('loadingProgress').style.width = Math.min(100, progress) + '%';
    }, 100);
}

// ========== ANIMATION ==========
let lastTime = 0;
function animate() {
    if (!gameActive) return;
    const now = performance.now();
    let delta = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;
    
    updateMovement(delta);
    updateAI(delta);
    handleInteractions();
    
    // Survie
    hunger = Math.max(0, hunger - 0.2 * delta * 30);
    thirst = Math.max(0, thirst - 0.3 * delta * 30);
    if (hunger <= 0 || thirst <= 0) {
        health = Math.max(0, health - 1.2 * delta * 30);
        updateHUD();
    }
    updateHUD();
    
    effectComposer.render();
    requestAnimationFrame(animate);
}

// ========== DÉMARRAGE ==========
document.getElementById('playBtn').addEventListener('click', startGame);

document.querySelectorAll('.menu-card').forEach(card => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.menu-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
    });
});

showNotification("Bienvenue dans SKY SURVIVALE", false);