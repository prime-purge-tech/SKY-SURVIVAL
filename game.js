import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// --- Configuration ---
const WORLD_SIZE = 220;
const ENEMY_COUNT = 12;
const FRIENDLY_COUNT = 5;
const NEUTRAL_SPECIAL_COUNT = 1; // Un seul masque neutre qui donne le contrôle

// --- State ---
let health = 100;
let armor = 0;
let hunger = 80;
let thirst = 80;
let gameOver = false;
let controlledMinions = []; // Liste des méchants contrôlés
let neutralMask = null; // Référence au masque neutre
let controlMode = false; // Mode contrôle activé ?

// --- Armes ---
let currentWeapon = 0;
const weapons = [
    { name: "WARZONE M4", damage: 34, ammo: 30, maxAmmo: 90, fireRate: 120, color: 0x5a5a5a },
    { name: "SNIPER", damage: 75, ammo: 8, maxAmmo: 24, fireRate: 800, color: 0x3a3a3a }
];
let currentAmmo = weapons[0].ammo;
let reserveAmmo = weapons[0].maxAmmo - weapons[0].ammo;
let canShoot = true;
let reloading = false;

// --- Collections ---
let enemies = [];
let friendlies = [];
let items = [];
let allCharacters = [];

// --- Three.js globals ---
let scene, camera, renderer, effectComposer;
let sun, ground;
let keyState = { w: false, s: false, a: false, d: false, shift: false };
let yaw = -Math.PI / 4, pitch = 0;
let moveSpeed = 6.0;
let mouseLocked = false;

// --- Métiers et capacités associées ---
const professions = [
    { name: "🏀 Basket", capacity: "super_saut", value: 1.8, desc: "Saut x2" },
    { name: "⚽ Foot", capacity: "super_vitesse", value: 2.2, desc: "Vitesse x2.2" },
    { name: "🎾 Tennis", capacity: "super_frappe", value: 1.6, desc: "Dégâts x1.6" },
    { name: "🏋️‍♂️ Muscu", capacity: "super_force", value: 1.5, desc: "Santé +50%" },
    { name: "🏃‍♂️ Sprint", capacity: "super_vitesse", value: 1.9, desc: "Vitesse x1.9" },
    { name: "🥊 Boxe", capacity: "super_frappe", value: 1.7, desc: "Dégâts x1.7" },
    { name: "🧗 Escalade", capacity: "super_saut", value: 1.6, desc: "Saut amélioré" },
    { name: "🏊 Natation", capacity: "super_vitesse", value: 1.5, desc: "Vitesse +50%" }
];

// --- Helper functions ---
function showNotif(msg, isBad = false) {
    const notif = document.getElementById('notification');
    notif.textContent = msg;
    notif.style.opacity = '1';
    notif.style.color = isBad ? '#ff8888' : '#aaffaa';
    setTimeout(() => { notif.style.opacity = '0'; }, 2500);
}

function updateUI() {
    document.getElementById('healthFill').style.width = `${Math.max(0, health)}%`;
    document.getElementById('healthVal').textContent = Math.floor(health);
    document.getElementById('armorFill').style.width = `${armor}%`;
    document.getElementById('armorVal').textContent = armor;
    document.getElementById('hungerFill').style.width = `${hunger}%`;
    document.getElementById('hungerVal').textContent = Math.floor(hunger);
    document.getElementById('thirstFill').style.width = `${thirst}%`;
    document.getElementById('thirstVal').textContent = Math.floor(thirst);
    document.getElementById('weaponName').textContent = weapons[currentWeapon].name;
    document.getElementById('ammo').textContent = `${currentAmmo}/${reserveAmmo + currentAmmo}`;
}

function updateSurvival() {
    if (gameOver) return;
    hunger = Math.max(0, hunger - 0.25);
    thirst = Math.max(0, thirst - 0.35);
    if (hunger <= 0 || thirst <= 0) {
        health = Math.max(0, health - 1.5);
        showNotif("⚠️ Survie critique !", true);
    }
    if (health <= 0) {
        gameOver = true;
        showNotif("💀 GAME OVER - Rafraîchis la page", true);
    }
    updateUI();
}
setInterval(updateSurvival, 2000);

// --- Création d'un personnage avec masque ---
function createMaskTexture(type, profession = null) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    // Fond du masque
    ctx.fillStyle = '#f5e6d3';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 4;
    ctx.strokeRect(5, 5, 246, 246);
    
    // Yeux
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(80, 110, 18, 0, Math.PI * 2);
    ctx.arc(176, 110, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(85, 105, 6, 0, Math.PI * 2);
    ctx.arc(181, 105, 6, 0, Math.PI * 2);
    ctx.fill();
    
    // Bouche selon type
    ctx.fillStyle = '#442211';
    if (type === 'enemy') {
        ctx.beginPath();
        ctx.arc(128, 180, 35, 0.1, Math.PI - 0.1);
        ctx.lineTo(128, 145);
        ctx.fill();
        ctx.fillStyle = '#aa5533';
        ctx.font = 'bold 40px Arial';
        ctx.fillText("💀", 100, 220);
    } else if (type === 'friendly') {
        ctx.beginPath();
        ctx.arc(128, 175, 30, 0, Math.PI);
        ctx.fill();
        ctx.fillStyle = '#88aa44';
        ctx.font = 'bold 40px Arial';
        ctx.fillText("😊", 105, 225);
    } else {
        ctx.beginPath();
        ctx.rect(98, 155, 60, 40);
        ctx.fill();
        ctx.fillStyle = '#aa8844';
        ctx.font = 'bold 35px Arial';
        ctx.fillText("🎭", 105, 210);
    }
    
    // Ajout texte métier pour les neutres/ennemis
    if (profession && (type === 'enemy' || type === 'neutral')) {
        ctx.font = 'bold 22px Arial';
        ctx.fillStyle = '#6a4e2e';
        ctx.fillText(profession.name, 70, 250);
    }
    
    return new THREE.CanvasTexture(canvas);
}

function createCharacter(x, z, type, profession = null) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6a5a4a, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.2, 0.6), bodyMat);
    body.position.y = 0.6;
    body.castShadow = true;
    group.add(body);
    
    const headMat = new THREE.MeshStandardMaterial({ color: 0xddbb99 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 24), headMat);
    head.position.y = 1.25;
    head.castShadow = true;
    group.add(head);
    
    const maskTex = createMaskTexture(type, profession);
    const maskMat = new THREE.MeshStandardMaterial({ map: maskTex });
    const mask = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.1), maskMat);
    mask.position.set(0, 1.25, 0.45);
    group.add(mask);
    
    group.position.set(x, -0.5, z);
    scene.add(group);
    
    const character = {
        mesh: group,
        type: type,
        health: type === 'enemy' ? (profession?.capacity === 'super_force' ? 120 : 80) : 100,
        speed: 2.5,
        profession: profession,
        capacity: profession?.capacity || null,
        capacityValue: profession?.value || 1,
        attackDamage: 15,
        attackCooldown: 0
    };
    
    if (type === 'enemy') character.attackDamage = Math.floor(15 * (character.capacityValue || 1));
    
    return character;
}

// --- Génération du monde ---
function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a1030);
    scene.fog = new THREE.FogExp2(0x0a1030, 0.0015);
    
    camera = new THREE.PerspectiveCamera(85, window.innerWidth / window.innerHeight, 0.05, 500);
    camera.position.set(0, 1.7, 0);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);
    
    effectComposer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.3, 0.2);
    effectComposer.addPass(renderPass);
    effectComposer.addPass(bloomPass);
    
    // Terrain
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a6b2f, roughness: 0.8, metalness: 0.05 });
    ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.7;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // Arbres
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8B5A2B });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x5c9e3e });
    for (let i = 0; i < 400; i++) {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 1.6, 5), trunkMat);
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.3, 6), leafMat);
        trunk.position.set((Math.random() - 0.5) * (WORLD_SIZE - 20), -0.6, (Math.random() - 0.5) * (WORLD_SIZE - 20));
        leaves.position.y = 1.1;
        trunk.add(leaves);
        trunk.castShadow = true;
        scene.add(trunk);
    }
    
    // Lumières
    sun = new THREE.DirectionalLight(0xffeedd, 1.2);
    sun.position.set(30, 50, 20);
    sun.castShadow = true;
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0x404060));
    const fillLight = new THREE.PointLight(0x6688aa, 0.4);
    fillLight.position.set(0, 15, 0);
    scene.add(fillLight);
    
    // Nuages
    const cloudCanvas = document.createElement('canvas');
    cloudCanvas.width = 64;
    cloudCanvas.height = 64;
    const cloudCtx = cloudCanvas.getContext('2d');
    cloudCtx.fillStyle = 'white';
    cloudCtx.beginPath();
    cloudCtx.ellipse(32, 32, 25, 18, 0, 0, Math.PI * 2);
    cloudCtx.fill();
    const cloudTex = new THREE.CanvasTexture(cloudCanvas);
    for (let i = 0; i < 80; i++) {
        const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: 0xccddff, opacity: 0.25, transparent: true }));
        cloud.scale.set(3 + Math.random() * 4, 1.8 + Math.random() * 2.5, 1);
        cloud.position.set((Math.random() - 0.5) * 180, 38 + Math.random() * 25, (Math.random() - 0.5) * 160);
        scene.add(cloud);
    }
}

// --- Génération des personnages ---
function spawnCharacters() {
    // Ennemis (méchants masque blanc triste)
    for (let i = 0; i < ENEMY_COUNT; i++) {
        const prof = professions[Math.floor(Math.random() * professions.length)];
        const angle = Math.random() * Math.PI * 2;
        const radius = 30 + Math.random() * 80;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const enemy = createCharacter(x, z, 'enemy', prof);
        enemies.push(enemy);
        allCharacters.push(enemy);
    }
    
    // Gentils (masque souriant) - viennent donner à manger
    for (let i = 0; i < FRIENDLY_COUNT; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 20 + Math.random() * 70;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const friendly = createCharacter(x, z, 'friendly', null);
        friendlies.push(friendly);
        allCharacters.push(friendly);
    }
    
    // Masque Neutre Spécial (un seul)
    const neutralAngle = Math.random() * Math.PI * 2;
    const neutralRadius = 40;
    const nx = Math.cos(neutralAngle) * neutralRadius;
    const nz = Math.sin(neutralAngle) * neutralRadius;
    neutralMask = createCharacter(nx, nz, 'neutral', { name: "🎭 Masque du Contrôle", capacity: "control", value: 1, desc: "Permet de contrôler 3 méchants" });
    allCharacters.push(neutralMask);
}

// --- Items au sol (nourriture, eau, armure) ---
function spawnItems() {
    const itemMatFood = new THREE.MeshStandardMaterial({ color: 0xffaa66, emissive: 0x442200 });
    const itemMatWater = new THREE.MeshStandardMaterial({ color: 0x66aaff, emissive: 0x004466 });
    const itemMatArmor = new THREE.MeshStandardMaterial({ color: 0x88aaff, emissive: 0x004488 });
    
    for (let i = 0; i < 50; i++) {
        let type, mat;
        const r = Math.random();
        if (r < 0.5) { type = 'food'; mat = itemMatFood; }
        else if (r < 0.8) { type = 'water'; mat = itemMatWater; }
        else { type = 'armor'; mat = itemMatArmor; }
        
        const item = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 12), mat);
        item.position.set((Math.random() - 0.5) * (WORLD_SIZE - 30), -0.4, (Math.random() - 0.5) * (WORLD_SIZE - 30));
        item.castShadow = true;
        scene.add(item);
        items.push({ mesh: item, type, value: type === 'armor' ? 25 : 20 });
    }
}

// --- Interaction avec les gentils (donnent des provisions) ---
function handleFriendlyInteractions() {
    for (let i = 0; i < friendlies.length; i++) {
        const f = friendlies[i];
        const dist = camera.position.distanceTo(f.mesh.position);
        if (dist < 2.0) {
            // Le gentil donne un sac de provisions
            hunger = Math.min(100, hunger + 35);
            thirst = Math.min(100, thirst + 35);
            armor = Math.min(100, armor + 15);
            showNotif("🎁 Un gentil t'a donné des provisions ! +35 faim/soif");
            // Il part (se téléporte loin et disparaît après)
            f.mesh.position.set(999, 999, 999);
            scene.remove(f.mesh);
            friendlies.splice(i, 1);
            allCharacters = allCharacters.filter(c => c !== f);
            i--;
        }
    }
}

// --- Interaction avec le masque neutre (contrôle des méchants) ---
function handleNeutralInteraction() {
    if (!neutralMask || controlledMinions.length >= 3) return;
    const dist = camera.position.distanceTo(neutralMask.mesh.position);
    if (dist < 2.5) {
        // Choisir 3 méchants aléatoires
        const availableEnemies = enemies.filter(e => !controlledMinions.includes(e));
        const toControl = availableEnemies.slice(0, Math.min(3, availableEnemies.length));
        for (let enemy of toControl) {
            controlledMinions.push(enemy);
            // Ajouter un effet visuel (couronne)
            const crownMat = new THREE.MeshStandardMaterial({ color: 0xffaa44, emissive: 0x442200 });
            const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 0.25, 6), crownMat);
            crown.position.y = 1.65;
            enemy.mesh.add(crown);
            enemy.isControlled = true;
            showNotif(`✅ ${enemy.profession?.name || "Méchant"} sous ton contrôle ! Capacité: ${enemy.profession?.desc || "Spéciale"}`);
        }
        // Faire disparaître le masque neutre
        scene.remove(neutralMask.mesh);
        neutralMask = null;
        showNotif("🎭 Tu peux maintenant commander tes unités !");
        document.getElementById('commandPanel').style.display = 'block';
    }
}

// --- Commande des unités ---
function initCommands() {
    document.getElementById('attackBtn').onclick = () => {
        if (controlledMinions.length === 0) return;
        // Cherche l'ennemi le plus proche
        let closest = null;
        let closestDist = Infinity;
        for (let enemy of enemies) {
            if (controlledMinions.includes(enemy)) continue;
            const dist = camera.position.distanceTo(enemy.mesh.position);
            if (dist < closestDist) {
                closestDist = dist;
                closest = enemy;
            }
        }
        if (closest) {
            for (let minion of controlledMinions) {
                minion.targetEnemy = closest;
                showNotif(`⚔️ Unités attaquent ${closest.profession?.name || "ennemi"}!`);
            }
        }
    };
    
    document.getElementById('moveHereBtn').onclick = () => {
        for (let minion of controlledMinions) {
            minion.followTarget = camera.position.clone();
            showNotif("🚶 Unités se dirigent vers toi");
        }
    };
}

// --- Mise à jour des ennemis et IA ---
function updateAI(delta) {
    // Ennemis attaquent le joueur
    for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (controlledMinions.includes(e)) continue; // Contrôlé n'attaque pas le joueur
        
        const dir = new THREE.Vector3().subVectors(camera.position, e.mesh.position).normalize();
        let spd = e.speed * (e.capacity === 'super_vitesse' ? e.capacityValue : 1);
        e.mesh.position.x += dir.x * spd * delta;
        e.mesh.position.z += dir.z * spd * delta;
        e.mesh.lookAt(camera.position);
        
        if (e.mesh.position.distanceTo(camera.position) < 1.4) {
            let dmg = e.attackDamage * (e.capacity === 'super_frappe' ? e.capacityValue : 1);
            health = Math.max(0, health - dmg * delta * 8);
            updateUI();
            const backDir = new THREE.Vector3().subVectors(e.mesh.position, camera.position).normalize();
            camera.position.x += backDir.x * 0.3;
            camera.position.z += backDir.z * 0.3;
        }
    }
    
    // Unités contrôlées
    for (let minion of controlledMinions) {
        if (minion.targetEnemy && minion.targetEnemy.health > 0) {
            const dir = new THREE.Vector3().subVectors(minion.targetEnemy.mesh.position, minion.mesh.position).normalize();
            let spd = minion.speed * (minion.capacity === 'super_vitesse' ? minion.capacityValue : 1);
            minion.mesh.position.x += dir.x * spd * delta;
            minion.mesh.position.z += dir.z * spd * delta;
            if (minion.mesh.position.distanceTo(minion.targetEnemy.mesh.position) < 1.5) {
                let dmg = minion.attackDamage * (minion.capacity === 'super_frappe' ? minion.capacityValue : 1);
                minion.targetEnemy.health -= dmg * delta * 5;
                if (minion.targetEnemy.health <= 0) {
                    scene.remove(minion.targetEnemy.mesh);
                    enemies = enemies.filter(e => e !== minion.targetEnemy);
                    minion.targetEnemy = null;
                    showNotif("🎯 Un ennemi éliminé par ton unité !");
                }
            }
        } else if (minion.followTarget) {
            const dir = new THREE.Vector3().subVectors(minion.followTarget, minion.mesh.position).normalize();
            let spd = minion.speed * (minion.capacity === 'super_vitesse' ? minion.capacityValue : 1);
            minion.mesh.position.x += dir.x * spd * delta;
            minion.mesh.position.z += dir.z * spd * delta;
            if (minion.mesh.position.distanceTo(minion.followTarget) < 1.5) minion.followTarget = null;
        }
    }
    
    // Mise à jour liste UI des contrôlés
    const minionListDiv = document.getElementById('minionList');
    if (controlledMinions.length > 0) {
        minionListDiv.innerHTML = controlledMinions.map((m, idx) => 
            `<div class="minion-item">🧟 ${m.profession?.name || "Soldat"} | ${m.profession?.desc || "Capacité active"}</div>`
        ).join('');
    } else {
        minionListDiv.innerHTML = '<div>Aucune unité contrôlée</div>';
    }
}

// --- Tir (Raycaster) ---
function shoot() {
    if (gameOver || reloading || !canShoot || currentAmmo <= 0) {
        if (currentAmmo <= 0 && !reloading) showNotif("🔫 Plus de balles ! Recharge R", true);
        return;
    }
    canShoot = false;
    currentAmmo--;
    updateUI();
    
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(allCharacters.map(c => c.mesh));
    if (intersects.length > 0) {
        const hit = intersects[0].object;
        const char = allCharacters.find(c => c.mesh === hit);
        if (char && char.type === 'enemy' && !controlledMinions.includes(char)) {
            char.health -= weapons[currentWeapon].damage;
            if (char.health <= 0) {
                scene.remove(char.mesh);
                enemies = enemies.filter(e => e !== char);
                allCharacters = allCharacters.filter(c => c !== char);
                showNotif(`💀 Ennemi éliminé ! + ressources`);
                hunger = Math.min(100, hunger + 10);
                thirst = Math.min(100, thirst + 8);
                updateUI();
            } else {
                showNotif(`🔫 -${weapons[currentWeapon].damage}`, true);
            }
        }
    }
    
    // Flash de tir
    const flash = new THREE.PointLight(0xffaa66, 0.7, 8);
    flash.position.copy(camera.position);
    scene.add(flash);
    setTimeout(() => scene.remove(flash), 80);
    setTimeout(() => { canShoot = true; }, weapons[currentWeapon].fireRate);
}

function reload() {
    if (reloading || currentAmmo === weapons[currentWeapon].maxAmmo) return;
    reloading = true;
    showNotif("🔄 Rechargement...");
    setTimeout(() => {
        const needed = weapons[currentWeapon].maxAmmo - currentAmmo;
        const take = Math.min(needed, reserveAmmo);
        currentAmmo += take;
        reserveAmmo -= take;
        reloading = false;
        updateUI();
        showNotif("✔️ Rechargé");
    }, 1600);
}

function switchWeapon(delta) {
    if (reloading) return;
    currentWeapon = (currentWeapon + delta + weapons.length) % weapons.length;
    currentAmmo = weapons[currentWeapon].ammo;
    reserveAmmo = weapons[currentWeapon].maxAmmo - currentAmmo;
    updateUI();
    showNotif(`🔁 ${weapons[currentWeapon].name}`);
}

// --- Collection d'items ---
function collectItems() {
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const dist = camera.position.distanceTo(item.mesh.position);
        if (dist < 1.2) {
            if (item.type === 'food') {
                hunger = Math.min(100, hunger + item.value);
                showNotif(`🍎 +${item.value} Nourriture`);
            } else if (item.type === 'water') {
                thirst = Math.min(100, thirst + item.value);
                showNotif(`💧 +${item.value} Eau`);
            } else if (item.type === 'armor') {
                armor = Math.min(100, armor + item.value);
                showNotif(`🛡️ +${item.value} Armure`);
            }
            scene.remove(item.mesh);
            items.splice(i, 1);
            updateUI();
            i--;
        }
    }
}

// --- Mouvements et contrôles ---
function initControls() {
    document.addEventListener('keydown', (e) => {
        switch(e.code) {
            case 'KeyW': keyState.w = true; break;
            case 'KeyS': keyState.s = true; break;
            case 'KeyA': keyState.a = true; break;
            case 'KeyD': keyState.d = true; break;
            case 'ShiftLeft': keyState.shift = true; moveSpeed = 9.0; break;
            case 'Digit1': switchWeapon(-1); break;
            case 'Digit2': switchWeapon(1); break;
            case 'KeyR': reload(); break;
        }
    });
    document.addEventListener('keyup', (e) => {
        switch(e.code) {
            case 'KeyW': keyState.w = false; break;
            case 'KeyS': keyState.s = false; break;
            case 'KeyA': keyState.a = false; break;
            case 'KeyD': keyState.d = false; break;
            case 'ShiftLeft': keyState.shift = false; moveSpeed = 6.0; break;
        }
    });
    
    document.addEventListener('mousemove', (e) => {
        if (mouseLocked) {
            yaw -= e.movementX * 0.002;
            pitch -= e.movementY * 0.002;
            pitch = Math.max(-Math.PI / 2.3, Math.min(Math.PI / 2.3, pitch));
            camera.rotation.order = 'YXZ';
            camera.rotation.y = yaw;
            camera.rotation.x = pitch;
        }
    });
    
    renderer.domElement.addEventListener('click', () => {
        renderer.domElement.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
        mouseLocked = document.pointerLockElement === renderer.domElement;
        document.getElementById('adsCrosshair').style.display = mouseLocked ? 'block' : 'none';
    });
    document.addEventListener('mousedown', (e) => {
        if (mouseLocked && e.button === 0) shoot();
    });
    
    document.getElementById('controlBtn').onclick = () => {
        if (neutralMask && neutralMask.mesh) {
            showNotif("🎭 Trouve et approche-toi du masque neutre pour contrôler des méchants !");
        } else if (controlledMinions.length > 0) {
            const panel = document.getElementById('commandPanel');
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        } else {
            showNotif("Aucune unité contrôlée. Cherche le masque neutre 🎭");
        }
    };
}

function updateMovement(delta) {
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
    
    // Limites du monde
    const limit = WORLD_SIZE / 2 - 5;
    camera.position.x = Math.max(-limit, Math.min(limit, camera.position.x));
    camera.position.z = Math.max(-limit, Math.min(limit, camera.position.z));
}

// --- Animation boucle principale ---
let lastTime = performance.now();
function animate() {
    const now = performance.now();
    let delta = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;
    
    if (!gameOver) {
        updateMovement(delta);
        updateAI(delta);
        collectItems();
        handleFriendlyInteractions();
        if (neutralMask) handleNeutralInteraction();
    }
    
    effectComposer.render();
    requestAnimationFrame(animate);
}

// --- Initialisation ---
function init() {
    initScene();
    spawnCharacters();
    spawnItems();
    initControls();
    initCommands();
    updateUI();
    animate();
    showNotif("🔥SKY SURVIVAL - Élimine des ennemis, trouve le masque neutre 🎭 pour contrôler 3 méchants !");
}

init();