import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as CANNON from 'cannon-es';

class PhysicsEngine {
    constructor() {
        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.82, 0);
        this.world.broadphase = new CANNON.NaiveBroadphase();
        this.world.solver.iterations = 10;
        
        this.bodies = [];
        this.isRunning = false;
    }

    step(dt) {
        if (this.isRunning) {
            this.world.step(dt);
        }
    }

    addBody(body) {
        this.world.addBody(body);
        this.bodies.push(body);
    }

    removeBody(body) {
        this.world.removeBody(body);
        const index = this.bodies.indexOf(body);
        if (index > -1) {
            this.bodies.splice(index, 1);
        }
    }

    clear() {
        for (const body of [...this.bodies]) {
            this.world.removeBody(body);
        }
        this.bodies = [];
    }

    setGravity(enabled, body = null) {
        if (body) {
            body.gravityScale = enabled ? 1 : 0;
        }
    }

    setBodyMass(body, mass) {
        body.mass = mass;
        body.updateMassProperties();
    }
}

class SceneManager {
    constructor() {
        this.objects = new Map();
        this.rules = [];
        this.selectedObjectId = null;
        this.initialStates = new Map();
    }

    addObject(id, mesh, body, data) {
        const obj = { id, mesh, body, data };
        this.objects.set(id, obj);
        this.saveInitialState(id);
        return obj;
    }

    removeObject(id) {
        const obj = this.objects.get(id);
        if (obj) {
            this.objects.delete(id);
            this.initialStates.delete(id);
            return obj;
        }
        return null;
    }

    getObject(id) {
        return this.objects.get(id);
    }

    getAllObjects() {
        return Array.from(this.objects.values());
    }

    saveInitialState(id) {
        const obj = this.objects.get(id);
        if (obj) {
            this.initialStates.set(id, {
                position: { ...obj.body.position },
                velocity: { ...obj.body.velocity },
                angularVelocity: { ...obj.body.angularVelocity },
                quaternion: { ...obj.body.quaternion },
                mass: obj.body.mass,
                gravityScale: obj.body.gravityScale
            });
        }
    }

    reset() {
        for (const [id, state] of this.initialStates) {
            const obj = this.objects.get(id);
            if (obj) {
                obj.body.position.set(state.position.x, state.position.y, state.position.z);
                obj.body.velocity.set(state.velocity.x, state.velocity.y, state.velocity.z);
                obj.body.angularVelocity.set(state.angularVelocity.x, state.angularVelocity.y, state.angularVelocity.z);
                obj.body.quaternion.set(state.quaternion.x, state.quaternion.y, state.quaternion.z, state.quaternion.w);
                obj.body.mass = state.mass;
                obj.body.gravityScale = state.gravityScale;
                obj.body.updateMassProperties();
            }
        }
    }

    addRule(rule) {
        this.rules.push(rule);
    }

    removeRule(ruleId) {
        const index = this.rules.findIndex(r => r.id === ruleId);
        if (index > -1) {
            this.rules.splice(index, 1);
        }
    }

    updateRules(physics) {
        for (const rule of this.rules) {
            if (!rule.enabled) continue;
            this.evaluateRule(rule, physics);
        }
    }

    evaluateRule(rule, physics) {
        let triggered = false;

        switch (rule.triggerType) {
            case 'collision':
                triggered = this.checkCollision(rule.sourceObjectId, rule.targetObjectId);
                break;
            case 'proximity':
                triggered = this.checkProximity(rule.sourceObjectId, rule.targetObjectId, 2);
                break;
            case 'velocity_threshold':
                triggered = this.checkVelocityThreshold(rule.sourceObjectId, parseFloat(rule.actionValue || '5'));
                break;
        }

        if (triggered) {
            this.executeAction(rule, physics);
        }
    }

    checkCollision(sourceId, targetId) {
        if (!sourceId || !targetId) return false;
        const source = this.objects.get(sourceId);
        const target = this.objects.get(targetId);
        
        if (!source || !target) return false;

        for (const contact of source.body.world.contacts) {
            const bi = contact.bi;
            const bj = contact.bj;
            if ((bi === source.body && bj === target.body) ||
                (bi === target.body && bj === source.body)) {
                return true;
            }
        }
        return false;
    }

    checkProximity(sourceId, targetId, threshold) {
        if (!sourceId || !targetId) return false;
        const source = this.objects.get(sourceId);
        const target = this.objects.get(targetId);
        
        if (!source || !target) return false;

        const distance = source.body.position.distanceTo(target.body.position);
        return distance < threshold;
    }

    checkVelocityThreshold(objectId, threshold) {
        if (!objectId) return false;
        const obj = this.objects.get(objectId);
        
        if (!obj) return false;

        const speed = obj.body.velocity.length();
        return speed > threshold;
    }

    executeAction(rule, physics) {
        const target = this.objects.get(rule.targetObjectId);
        if (!target) return;

        switch (rule.actionType) {
            case 'disable_gravity':
                target.body.gravityScale = 0;
                break;
            case 'enable_gravity':
                target.body.gravityScale = 1;
                break;
            case 'set_static':
                target.body.mass = 0;
                target.body.updateMassProperties();
                break;
            case 'set_dynamic':
                target.body.mass = 1;
                target.body.updateMassProperties();
                break;
            case 'apply_impulse':
                const impulse = new CANNON.Vec3(0, 10, 0);
                target.body.applyImpulse(impulse, target.body.position);
                break;
            case 'change_color':
                if (target.mesh.material) {
                    target.mesh.material.color.setHex(Math.random() * 0xffffff);
                }
                break;
        }
    }

    toJSON() {
        const objects = [];
        for (const [id, obj] of this.objects) {
            objects.push({
                id: obj.id,
                type: obj.data.type,
                position: [obj.body.position.x, obj.body.position.y, obj.body.position.z],
                rotation: [obj.body.quaternion.x, obj.body.quaternion.y, obj.body.quaternion.z, obj.body.quaternion.w],
                scale: [obj.mesh.scale.x, obj.mesh.scale.y, obj.mesh.scale.z],
                mass: obj.body.mass,
                restitution: obj.body.material ? obj.body.material.restitution : 0.5,
                friction: obj.body.material ? obj.body.material.friction : 0.5,
                velocity: [obj.body.velocity.x, obj.body.velocity.y, obj.body.velocity.z],
                angularVelocity: [obj.body.angularVelocity.x, obj.body.angularVelocity.y, obj.body.angularVelocity.z],
                isStatic: obj.body.mass === 0,
                color: '#' + obj.mesh.material.color.getHexString(),
                gravityEnabled: obj.body.gravityScale === 1
            });
        }

        return {
            objects,
            rules: [...this.rules]
        };
    }
}

class UIManager {
    constructor(app) {
        this.app = app;
        this.currentTool = 'select';
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        document.querySelectorAll('.shape-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.app.spawnObject(btn.dataset.shape);
            });
        });

        document.getElementById('btn-select').addEventListener('click', () => this.setTool('select'));
        document.getElementById('btn-move').addEventListener('click', () => this.setTool('move'));
        document.getElementById('btn-rotate').addEventListener('click', () => this.setTool('rotate'));
        document.getElementById('btn-play').addEventListener('click', () => this.togglePlay());
        document.getElementById('btn-reset').addEventListener('click', () => this.resetScene());

        const spawnSliders = ['spawn-mass', 'spawn-restitution', 'spawn-friction'];
        spawnSliders.forEach(id => {
            const slider = document.getElementById(id);
            if (slider) {
                slider.addEventListener('input', (e) => this.updateSpawnValue(id, e.target.value));
            }
        });

        const colorInput = document.getElementById('spawn-color');
        if (colorInput) {
            colorInput.addEventListener('input', (e) => {
                document.getElementById('spawn-color-hex').textContent = e.target.value;
            });
        }

        document.querySelectorAll('.color-swatch').forEach(swatch => {
            swatch.addEventListener('click', () => {
                const color = swatch.dataset.color;
                document.getElementById('spawn-color').value = color;
                document.getElementById('spawn-color-hex').textContent = color;
                document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
                swatch.classList.add('selected');
            });
        });

        const propSliders = ['prop-mass', 'prop-restitution', 'prop-friction'];
        propSliders.forEach(id => {
            const slider = document.getElementById(id);
            if (slider) {
                slider.addEventListener('input', (e) => this.updatePropertyValue(id, e.target.value));
            }
        });

        const propInputs = ['pos-x', 'pos-y', 'pos-z', 'scale-x', 'scale-y', 'scale-z'];
        propInputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('change', (e) => this.updateObjectProperty(id, e.target.value));
            }
        });

        document.getElementById('prop-static').addEventListener('change', (e) => {
            this.updateObjectStatic(e.target.checked);
        });

        document.getElementById('prop-gravity').addEventListener('change', (e) => {
            this.updateObjectGravity(e.target.checked);
        });

        document.getElementById('prop-color').addEventListener('input', (e) => {
            this.updateObjectColor(e.target.value);
        });

        document.getElementById('btn-delete-object').addEventListener('click', () => {
            this.deleteSelectedObject();
        });

        document.getElementById('btn-add-rule').addEventListener('click', () => {
            this.addNewRule();
        });

        document.getElementById('btn-save').addEventListener('click', () => {
            document.getElementById('save-modal').classList.add('active');
        });

        document.getElementById('btn-cancel-save').addEventListener('click', () => {
            document.getElementById('save-modal').classList.remove('active');
        });

        document.getElementById('btn-confirm-save').addEventListener('click', () => {
            const name = document.getElementById('save-name').value.trim();
            if (name) {
                this.saveScene(name);
                document.getElementById('save-modal').classList.remove('active');
                document.getElementById('save-name').value = '';
            }
        });

        document.getElementById('btn-load').addEventListener('click', () => {
            this.loadScenesList();
            document.getElementById('load-modal').classList.add('active');
        });

        document.getElementById('btn-cancel-load').addEventListener('click', () => {
            document.getElementById('load-modal').classList.remove('active');
        });

        document.getElementById('btn-clear').addEventListener('click', () => {
            if (confirm('确定要清空场景吗？所有物体和规则都将被删除。')) {
                this.app.clearScene();
                this.updateRulesList();
            }
        });

        document.getElementById('btn-close-modal').addEventListener('click', () => {
            document.getElementById('success-modal').classList.remove('active');
        });

        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                this.togglePlay();
            } else if (e.code === 'KeyR') {
                this.resetScene();
            } else if (e.code === 'Delete' || e.code === 'Backspace') {
                if (this.app.sceneManager.selectedObjectId) {
                    this.deleteSelectedObject();
                }
            } else if (e.code === 'Escape') {
                this.app.sceneManager.selectedObjectId = null;
                this.updateSelectedObject();
            }
        });
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `tab-${tabName}`);
        });
    }

    setTool(tool) {
        this.currentTool = tool;
        document.querySelectorAll('.toolbar-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.getElementById(`btn-${tool}`).classList.add('active');
    }

    togglePlay() {
        this.app.physics.isRunning = !this.app.physics.isRunning;
        const btn = document.getElementById('btn-play');
        const indicator = document.getElementById('status-indicator');
        const text = document.getElementById('status-text');

        if (this.app.physics.isRunning) {
            btn.innerHTML = '<span>⏸ 暂停</span>';
            indicator.classList.remove('status-paused');
            indicator.classList.add('status-running');
            text.textContent = '运行中';
        } else {
            btn.innerHTML = '<span>▶ 播放</span>';
            indicator.classList.remove('status-running');
            indicator.classList.add('status-paused');
            text.textContent = '已暂停';
        }
    }

    resetScene() {
        this.app.sceneManager.reset();
        if (this.app.physics.isRunning) {
            this.togglePlay();
        }
    }

    updateSpawnValue(id, value) {
        const valueEl = document.getElementById(`${id}-value`);
        if (valueEl) {
            if (id === 'spawn-mass') {
                valueEl.textContent = `${parseFloat(value).toFixed(1)} kg`;
            } else if (id === 'spawn-restitution') {
                valueEl.textContent = `${value}%`;
            } else if (id === 'spawn-friction') {
                valueEl.textContent = parseFloat(value).toFixed(2);
            }
        }
    }

    updatePropertyValue(id, value) {
        const valueEl = document.getElementById(`${id}-value`);
        if (valueEl) {
            if (id === 'prop-mass') {
                valueEl.textContent = `${parseFloat(value).toFixed(1)} kg`;
            } else if (id === 'prop-restitution') {
                valueEl.textContent = `${value}%`;
            } else if (id === 'prop-friction') {
                valueEl.textContent = parseFloat(value).toFixed(2);
            }
        }

        const obj = this.app.sceneManager.getObject(this.app.sceneManager.selectedObjectId);
        if (!obj) return;

        if (id === 'prop-mass') {
            obj.body.mass = parseFloat(value);
            obj.body.updateMassProperties();
        } else if (id === 'prop-restitution') {
            if (obj.body.material) {
                obj.body.material.restitution = parseFloat(value) / 100;
            }
        } else if (id === 'prop-friction') {
            if (obj.body.material) {
                obj.body.material.friction = parseFloat(value);
            }
        }
    }

    updateObjectProperty(id, value) {
        const obj = this.app.sceneManager.getObject(this.app.sceneManager.selectedObjectId);
        if (!obj) return;

        const numValue = parseFloat(value);
        if (isNaN(numValue)) return;

        if (id.startsWith('pos-')) {
            const axis = id.split('-')[1];
            obj.body.position[axis] = numValue;
        } else if (id.startsWith('scale-')) {
            const axis = id.split('-')[1];
            obj.mesh.scale[axis] = numValue;
        }
    }

    updateObjectStatic(isStatic) {
        const obj = this.app.sceneManager.getObject(this.app.sceneManager.selectedObjectId);
        if (!obj) return;

        obj.body.mass = isStatic ? 0 : 1;
        obj.body.updateMassProperties();
    }

    updateObjectGravity(enabled) {
        const obj = this.app.sceneManager.getObject(this.app.sceneManager.selectedObjectId);
        if (!obj) return;

        obj.body.gravityScale = enabled ? 1 : 0;
    }

    updateObjectColor(color) {
        const obj = this.app.sceneManager.getObject(this.app.sceneManager.selectedObjectId);
        if (!obj) return;

        if (obj.mesh.material) {
            obj.mesh.material.color.set(color);
        }
        document.getElementById('prop-color-hex').textContent = color;
    }

    deleteSelectedObject() {
        const id = this.app.sceneManager.selectedObjectId;
        if (!id) return;

        const obj = this.app.sceneManager.removeObject(id);
        if (obj) {
            this.app.physics.removeBody(obj.body);
            this.app.scene.remove(obj.mesh);
            this.app.sceneManager.selectedObjectId = null;
            this.updateSelectedObject();
        }
    }

    updateSelectedObject() {
        const id = this.app.sceneManager.selectedObjectId;
        const infoPanel = document.getElementById('selected-info');
        const propertiesEmpty = document.getElementById('properties-empty');
        const propertiesPanel = document.getElementById('properties-panel');

        if (!id) {
            infoPanel.style.display = 'none';
            propertiesEmpty.style.display = 'block';
            propertiesPanel.style.display = 'none';
            return;
        }

        const obj = this.app.sceneManager.getObject(id);
        if (!obj) return;

        infoPanel.style.display = 'block';
        propertiesEmpty.style.display = 'none';
        propertiesPanel.style.display = 'block';

        const typeNames = {
            cube: '立方体',
            sphere: '球体',
            cylinder: '圆柱体',
            plane: '平面'
        };

        document.getElementById('selected-title').textContent = `${typeNames[obj.data.type] || obj.data.type} (${id.slice(0, 8)})`;
        document.getElementById('selected-details').innerHTML = `
            类型: ${typeNames[obj.data.type] || obj.data.type}<br>
            位置: (${obj.body.position.x.toFixed(1)}, ${obj.body.position.y.toFixed(1)}, ${obj.body.position.z.toFixed(1)})
        `;

        document.getElementById('prop-type').value = typeNames[obj.data.type] || obj.data.type;
        document.getElementById('prop-id').value = id;

        document.getElementById('pos-x').value = obj.body.position.x.toFixed(1);
        document.getElementById('pos-y').value = obj.body.position.y.toFixed(1);
        document.getElementById('pos-z').value = obj.body.position.z.toFixed(1);

        document.getElementById('scale-x').value = obj.mesh.scale.x.toFixed(1);
        document.getElementById('scale-y').value = obj.mesh.scale.y.toFixed(1);
        document.getElementById('scale-z').value = obj.mesh.scale.z.toFixed(1);

        document.getElementById('prop-mass').value = obj.body.mass;
        document.getElementById('prop-mass-value').textContent = `${obj.body.mass.toFixed(1)} kg`;

        const restitution = obj.body.material ? (obj.body.material.restitution * 100) : 50;
        document.getElementById('prop-restitution').value = Math.round(restitution);
        document.getElementById('prop-restitution-value').textContent = `${Math.round(restitution)}%`;

        const friction = obj.body.material ? obj.body.material.friction : 0.5;
        document.getElementById('prop-friction').value = friction;
        document.getElementById('prop-friction-value').textContent = friction.toFixed(2);

        const colorHex = obj.mesh.material ? '#' + obj.mesh.material.color.getHexString() : '#4cc9f0';
        document.getElementById('prop-color').value = colorHex;
        document.getElementById('prop-color-hex').textContent = colorHex;

        document.getElementById('prop-static').checked = obj.body.mass === 0;
        document.getElementById('prop-gravity').checked = obj.body.gravityScale === 1;
    }

    addNewRule() {
        const rule = {
            id: 'rule_' + Date.now(),
            triggerType: 'collision',
            sourceObjectId: null,
            targetObjectId: null,
            actionType: 'disable_gravity',
            actionValue: null,
            enabled: true
        };
        this.app.sceneManager.addRule(rule);
        this.updateRulesList();
    }

    updateRulesList() {
        const container = document.getElementById('rules-list');
        const rules = this.app.sceneManager.rules;

        if (rules.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📜</div>
                    <p style="font-size: 12px;">暂无规则，点击下方按钮添加</p>
                </div>
            `;
            return;
        }

        const objects = this.app.sceneManager.getAllObjects();
        const objectOptions = objects.map(obj => 
            `<option value="${obj.id}">${obj.data.type} (${obj.id.slice(0, 8)})</option>`
        ).join('');

        container.innerHTML = rules.map((rule, index) => `
            <div class="rule-card" data-rule-id="${rule.id}">
                <div class="rule-card-header">
                    <span class="rule-card-title">规则 ${index + 1}</span>
                    <div class="btn-group">
                        <button class="btn btn-secondary btn-sm" onclick="app.ui.toggleRule('${rule.id}')">
                            ${rule.enabled ? '禁用' : '启用'}
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="app.ui.removeRule('${rule.id}')">删除</button>
                    </div>
                </div>
                <div class="rule-row">
                    <span class="rule-keyword">当</span>
                    <select class="form-select" style="width: auto;" onchange="app.ui.updateRuleField('${rule.id}', 'sourceObjectId', this.value)">
                        <option value="">选择物体...</option>
                        ${objectOptions}
                    </select>
                </div>
                <div class="rule-row">
                    <select class="form-select" style="width: auto;" onchange="app.ui.updateRuleField('${rule.id}', 'triggerType', this.value)">
                        <option value="collision" ${rule.triggerType === 'collision' ? 'selected' : ''}>碰撞</option>
                        <option value="proximity" ${rule.triggerType === 'proximity' ? 'selected' : ''}>接近</option>
                        <option value="velocity_threshold" ${rule.triggerType === 'velocity_threshold' ? 'selected' : ''}>速度超过</option>
                    </select>
                    <select class="form-select" style="width: auto;" onchange="app.ui.updateRuleField('${rule.id}', 'targetObjectId', this.value)">
                        <option value="">选择目标...</option>
                        ${objectOptions}
                    </select>
                </div>
                <div class="rule-row">
                    <span class="rule-keyword">导致</span>
                    <select class="form-select" style="width: auto;" onchange="app.ui.updateRuleField('${rule.id}', 'actionType', this.value)">
                        <option value="disable_gravity" ${rule.actionType === 'disable_gravity' ? 'selected' : ''}>关闭重力</option>
                        <option value="enable_gravity" ${rule.actionType === 'enable_gravity' ? 'selected' : ''}>开启重力</option>
                        <option value="set_static" ${rule.actionType === 'set_static' ? 'selected' : ''}>设为固定</option>
                        <option value="set_dynamic" ${rule.actionType === 'set_dynamic' ? 'selected' : ''}>设为动态</option>
                        <option value="apply_impulse" ${rule.actionType === 'apply_impulse' ? 'selected' : ''}>施加冲量</option>
                        <option value="change_color" ${rule.actionType === 'change_color' ? 'selected' : ''}>改变颜色</option>
                    </select>
                </div>
            </div>
        `).join('');
    }

    updateRuleField(ruleId, field, value) {
        const rule = this.app.sceneManager.rules.find(r => r.id === ruleId);
        if (rule) {
            rule[field] = value === '' ? null : value;
        }
    }

    toggleRule(ruleId) {
        const rule = this.app.sceneManager.rules.find(r => r.id === ruleId);
        if (rule) {
            rule.enabled = !rule.enabled;
            this.updateRulesList();
        }
    }

    removeRule(ruleId) {
        this.app.sceneManager.removeRule(ruleId);
        this.updateRulesList();
    }

    async saveScene(name) {
        const data = this.app.sceneManager.toJSON();
        try {
            const response = await fetch(`/api/scenes/${encodeURIComponent(name)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    ...data
                })
            });
            if (response.ok) {
                alert('场景已保存！');
            }
        } catch (e) {
            console.error('保存失败:', e);
            alert('保存失败');
        }
    }

    async loadScenesList() {
        const container = document.getElementById('load-scene-list');
        try {
            const response = await fetch('/api/scenes');
            const data = await response.json();
            
            if (data.scenes.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">📂</div>
                        <p style="font-size: 12px;">暂无保存的场景</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = data.scenes.map(scene => `
                <div class="challenge-card" onclick="app.ui.loadScene('${scene.name}')">
                    <div class="challenge-name">${scene.name}</div>
                    <div class="challenge-desc">
                        ${scene.objectCount} 个物体, ${scene.ruleCount} 条规则
                    </div>
                </div>
            `).join('');
        } catch (e) {
            console.error('加载场景列表失败:', e);
        }
    }

    async loadScene(name) {
        try {
            const response = await fetch(`/api/scenes/${encodeURIComponent(name)}`);
            const data = await response.json();
            
            this.app.clearScene();
            
            for (const objData of data.objects) {
                this.app.loadObject(objData);
            }

            this.app.sceneManager.rules = data.rules || [];
            this.updateRulesList();
            
            document.getElementById('load-modal').classList.remove('active');
        } catch (e) {
            console.error('加载场景失败:', e);
            alert('加载失败');
        }
    }

    async loadChallenges() {
        const container = document.getElementById('challenges-list');
        try {
            const response = await fetch('/api/challenges');
            const data = await response.json();
            
            container.innerHTML = data.challenges.map(challenge => `
                <div class="challenge-card" onclick="app.startChallenge('${challenge.id}')">
                    <div class="challenge-name">${challenge.name}</div>
                    <div class="challenge-desc">${challenge.description}</div>
                    <span class="challenge-difficulty ${this.getDifficultyClass(challenge.difficulty)}">
                        ${challenge.difficulty}
                    </span>
                </div>
            `).join('');
        } catch (e) {
            console.error('加载挑战列表失败:', e);
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">❌</div>
                    <p style="font-size: 12px;">加载失败</p>
                </div>
            `;
        }
    }

    getDifficultyClass(difficulty) {
        const map = {
            '简单': 'difficulty-easy',
            '中等': 'difficulty-medium',
            '困难': 'difficulty-hard'
        };
        return map[difficulty] || 'difficulty-medium';
    }
}

class App {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.physics = null;
        this.sceneManager = null;
        this.ui = null;
        
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        this.activeChallenge = null;
        this.challengeTimer = 0;
        this.challengeStartTime = 0;
        
        this.init();
    }

    init() {
        this.initThree();
        this.physics = new PhysicsEngine();
        this.sceneManager = new SceneManager();
        this.ui = new UIManager(this);
        
        this.createGround();
        this.ui.loadChallenges();
        
        this.animate();
        
        this.setupInteraction();
    }

    initThree() {
        const container = document.getElementById('canvas-container');
        const canvas = document.getElementById('three-canvas');

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);

        this.camera = new THREE.PerspectiveCamera(
            60,
            container.clientWidth / container.clientHeight,
            0.1,
            1000
        );
        this.camera.position.set(10, 8, 10);

        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.shadowMap.enabled = true;

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 20, 10);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        this.scene.add(directionalLight);

        const pointLight = new THREE.PointLight(0x4cc9f0, 0.5, 50);
        pointLight.position.set(-5, 10, -5);
        this.scene.add(pointLight);

        const gridHelper = new THREE.GridHelper(50, 50, 0x333333, 0x222222);
        this.scene.add(gridHelper);

        window.addEventListener('resize', () => this.onWindowResize());
    }

    createGround() {
        const groundGeometry = new THREE.PlaneGeometry(50, 50);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x2d3436,
            roughness: 0.8,
            metalness: 0.2
        });
        const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.receiveShadow = true;
        this.scene.add(groundMesh);

        const groundShape = new CANNON.Plane();
        const groundBody = new CANNON.Body({
            mass: 0,
            shape: groundShape,
            material: new CANNON.Material({ friction: 0.5, restitution: 0.3 })
        });
        groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        this.physics.addBody(groundBody);
    }

    setupInteraction() {
        const canvas = this.renderer.domElement;

        canvas.addEventListener('click', (e) => {
            this.onMouseClick(e);
        });

        canvas.addEventListener('mousemove', (e) => {
            this.onMouseMove(e);
        });
    }

    onMouseClick(e) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        const meshes = this.sceneManager.getAllObjects().map(o => o.mesh);
        const intersects = this.raycaster.intersectObjects(meshes);

        if (intersects.length > 0) {
            const clickedMesh = intersects[0].object;
            const obj = this.sceneManager.getAllObjects().find(o => o.mesh === clickedMesh);
            
            if (obj) {
                this.sceneManager.selectedObjectId = obj.id;
                this.ui.updateSelectedObject();
                this.ui.updateRulesList();
            }
        } else {
            this.sceneManager.selectedObjectId = null;
            this.ui.updateSelectedObject();
        }
    }

    onMouseMove(e) {
    }

    spawnObject(type) {
        const spawnSettings = this.getSpawnSettings();
        
        const id = 'obj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        let geometry, shape, halfExtents;
        const size = 1;

        switch (type) {
            case 'cube':
                geometry = new THREE.BoxGeometry(size, size, size);
                shape = new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2));
                break;
            case 'sphere':
                geometry = new THREE.SphereGeometry(size / 2, 16, 16);
                shape = new CANNON.Sphere(size / 2);
                break;
            case 'cylinder':
                geometry = new THREE.CylinderGeometry(size / 2, size / 2, size, 16);
                shape = new CANNON.Cylinder(size / 2, size / 2, size, 16);
                break;
            case 'plane':
                geometry = new THREE.PlaneGeometry(size * 2, size * 2);
                shape = new CANNON.Plane();
                break;
            default:
                return;
        }

        const material = new THREE.MeshStandardMaterial({
            color: spawnSettings.color,
            roughness: 0.7,
            metalness: 0.1
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const offset = (this.sceneManager.objects.size % 5) - 2;
        const height = 3 + Math.floor(this.sceneManager.objects.size / 5) * 2;
        mesh.position.set(offset * 1.5, height, 0);

        if (type === 'plane') {
            mesh.rotation.x = -Math.PI / 2;
        }

        this.scene.add(mesh);

        const physicsMaterial = new CANNON.Material({
            friction: spawnSettings.friction,
            restitution: spawnSettings.restitution
        });

        const body = new CANNON.Body({
            mass: spawnSettings.isStatic ? 0 : spawnSettings.mass,
            shape: shape,
            material: physicsMaterial
        });

        body.position.copy(mesh.position);
        body.quaternion.copy(mesh.quaternion);
        body.gravityScale = spawnSettings.isStatic ? 0 : 1;

        this.physics.addBody(body);

        const obj = this.sceneManager.addObject(id, mesh, body, {
            type: type,
            spawnSettings: { ...spawnSettings }
        });

        this.ui.updateRulesList();
    }

    loadObject(objData) {
        const id = objData.id;
        const type = objData.type;
        
        let geometry, shape;
        const scale = objData.scale || [1, 1, 1];

        switch (type) {
            case 'cube':
                geometry = new THREE.BoxGeometry(1, 1, 1);
                shape = new CANNON.Box(new CANNON.Vec3(scale[0] / 2, scale[1] / 2, scale[2] / 2));
                break;
            case 'sphere':
                geometry = new THREE.SphereGeometry(0.5, 16, 16);
                shape = new CANNON.Sphere(scale[0] / 2);
                break;
            case 'cylinder':
                geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
                shape = new CANNON.Cylinder(scale[0] / 2, scale[0] / 2, scale[1], 16);
                break;
            case 'plane':
                geometry = new THREE.PlaneGeometry(2, 2);
                shape = new CANNON.Plane();
                break;
            default:
                return;
        }

        const material = new THREE.MeshStandardMaterial({
            color: objData.color || '#4cc9f0',
            roughness: 0.7,
            metalness: 0.1
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.set(...objData.position);
        mesh.scale.set(...scale);
        
        if (objData.rotation && objData.rotation.length === 4) {
            mesh.quaternion.set(...objData.rotation);
        }

        this.scene.add(mesh);

        const physicsMaterial = new CANNON.Material({
            friction: objData.friction || 0.5,
            restitution: objData.restitution || 0.5
        });

        const body = new CANNON.Body({
            mass: objData.isStatic ? 0 : (objData.mass || 1),
            shape: shape,
            material: physicsMaterial
        });

        body.position.set(...objData.position);
        if (objData.rotation && objData.rotation.length === 4) {
            body.quaternion.set(...objData.rotation);
        }
        body.gravityScale = objData.gravityEnabled ? 1 : 0;

        this.physics.addBody(body);

        this.sceneManager.addObject(id, mesh, body, {
            type: type
        });
    }

    getSpawnSettings() {
        return {
            mass: parseFloat(document.getElementById('spawn-mass').value) || 1,
            restitution: (parseFloat(document.getElementById('spawn-restitution').value) || 50) / 100,
            friction: parseFloat(document.getElementById('spawn-friction').value) || 0.5,
            color: document.getElementById('spawn-color').value || '#4cc9f0',
            isStatic: document.getElementById('spawn-static').checked
        };
    }

    clearScene() {
        for (const [id, obj] of this.sceneManager.objects) {
            this.physics.removeBody(obj.body);
            this.scene.remove(obj.mesh);
        }
        this.sceneManager.objects.clear();
        this.sceneManager.rules = [];
        this.sceneManager.selectedObjectId = null;
        this.ui.updateSelectedObject();
        this.ui.updateRulesList();
    }

    startChallenge(challengeId) {
        this.clearScene();
        this.activeChallenge = challengeId;
        this.challengeStartTime = Date.now();
        this.challengeTimer = 0;

        const timerEl = document.getElementById('challenge-timer');
        timerEl.classList.add('visible');

        switch (challengeId) {
            case 'hover_ball':
                this.setupHoverChallenge();
                break;
            case 'chain_reaction':
                this.setupChainReactionChallenge();
                break;
            case 'perfect_landing':
                this.setupPerfectLandingChallenge();
                break;
        }

        this.ui.switchTab('rules');
    }

    setupHoverChallenge() {
        const spawnSettings = this.getSpawnSettings();
        
        const sphereId = 'obj_challenge_sphere';
        const sphereGeometry = new THREE.SphereGeometry(0.5, 16, 16);
        const sphereMaterial = new THREE.MeshStandardMaterial({
            color: '#f72585',
            roughness: 0.7,
            metalness: 0.1
        });
        const sphereMesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
        sphereMesh.position.set(0, 5, 0);
        sphereMesh.castShadow = true;
        this.scene.add(sphereMesh);

        const sphereShape = new CANNON.Sphere(0.5);
        const spherePhysicsMaterial = new CANNON.Material({ friction: 0.5, restitution: 0.8 });
        const sphereBody = new CANNON.Body({
            mass: 1,
            shape: sphereShape,
            material: spherePhysicsMaterial
        });
        sphereBody.position.copy(sphereMesh.position);
        this.physics.addBody(sphereBody);

        this.sceneManager.addObject(sphereId, sphereMesh, sphereBody, {
            type: 'sphere'
        });

        const cubeId = 'obj_challenge_trigger';
        const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
        const cubeMaterial = new THREE.MeshStandardMaterial({
            color: '#4cc9f0',
            roughness: 0.7,
            metalness: 0.1
        });
        const cubeMesh = new THREE.Mesh(cubeGeometry, cubeMaterial);
        cubeMesh.position.set(0, 1, -3);
        cubeMesh.castShadow = true;
        this.scene.add(cubeMesh);

        const cubeShape = new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));
        const cubeBody = new CANNON.Body({
            mass: 0,
            shape: cubeShape,
            material: new CANNON.Material({ friction: 0.5, restitution: 0.5 })
        });
        cubeBody.position.copy(cubeMesh.position);
        this.physics.addBody(cubeBody);

        this.sceneManager.addObject(cubeId, cubeMesh, cubeBody, {
            type: 'cube'
        });

        this.sceneManager.addRule({
            id: 'rule_challenge_hover',
            triggerType: 'collision',
            sourceObjectId: sphereId,
            targetObjectId: cubeId,
            actionType: 'disable_gravity',
            actionValue: null,
            enabled: true
        });

        this.ui.updateRulesList();
    }

    setupChainReactionChallenge() {
        for (let i = 0; i < 6; i++) {
            const cubeGeometry = new THREE.BoxGeometry(0.3, 2, 0.8);
            const cubeMaterial = new THREE.MeshStandardMaterial({
                color: `hsl(${i * 60}, 70%, 60%)`,
                roughness: 0.7,
                metalness: 0.1
            });
            const cubeMesh = new THREE.Mesh(cubeGeometry, cubeMaterial);
            cubeMesh.position.set(i * 1.5, 1, 0);
            cubeMesh.rotation.y = Math.PI / 6;
            cubeMesh.castShadow = true;
            this.scene.add(cubeMesh);

            const cubeShape = new CANNON.Box(new CANNON.Vec3(0.15, 1, 0.4));
            const cubeBody = new CANNON.Body({
                mass: 1,
                shape: cubeShape,
                material: new CANNON.Material({ friction: 0.3, restitution: 0.1 })
            });
            cubeBody.position.copy(cubeMesh.position);
            cubeBody.quaternion.copy(cubeMesh.quaternion);
            this.physics.addBody(cubeBody);

            const id = `obj_domino_${i}`;
            this.sceneManager.addObject(id, cubeMesh, cubeBody, {
                type: 'cube'
            });
        }
    }

    setupPerfectLandingChallenge() {
        const sphereId = 'obj_landing_sphere';
        const sphereGeometry = new THREE.SphereGeometry(0.5, 16, 16);
        const sphereMaterial = new THREE.MeshStandardMaterial({
            color: '#f72585',
            roughness: 0.7,
            metalness: 0.1
        });
        const sphereMesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
        sphereMesh.position.set(0, 8, 0);
        sphereMesh.castShadow = true;
        this.scene.add(sphereMesh);

        const sphereShape = new CANNON.Sphere(0.5);
        const sphereBody = new CANNON.Body({
            mass: 1,
            shape: sphereShape,
            material: new CANNON.Material({ friction: 0.5, restitution: 0.3 })
        });
        sphereBody.position.copy(sphereMesh.position);
        this.physics.addBody(sphereBody);

        this.sceneManager.addObject(sphereId, sphereMesh, sphereBody, {
            type: 'sphere'
        });

        const platformId = 'obj_landing_platform';
        const platformGeometry = new THREE.BoxGeometry(3, 0.5, 3);
        const platformMaterial = new THREE.MeshStandardMaterial({
            color: '#43e695',
            roughness: 0.8,
            metalness: 0.1
        });
        const platformMesh = new THREE.Mesh(platformGeometry, platformMaterial);
        platformMesh.position.set(0, 0.25, 0);
        platformMesh.receiveShadow = true;
        this.scene.add(platformMesh);

        const platformShape = new CANNON.Box(new CANNON.Vec3(1.5, 0.25, 1.5));
        const platformBody = new CANNON.Body({
            mass: 0,
            shape: platformShape,
            material: new CANNON.Material({ friction: 0.5, restitution: 0.3 })
        });
        platformBody.position.copy(platformMesh.position);
        this.physics.addBody(platformBody);

        this.sceneManager.addObject(platformId, platformMesh, platformBody, {
            type: 'cube'
        });
    }

    checkChallengeComplete() {
        if (!this.activeChallenge) return;

        const now = Date.now();
        
        switch (this.activeChallenge) {
            case 'hover_ball':
                this.checkHoverChallenge();
                break;
            case 'chain_reaction':
                break;
            case 'perfect_landing':
                this.checkLandingChallenge();
                break;
        }
    }

    checkHoverChallenge() {
        const sphere = this.sceneManager.getObject('obj_challenge_sphere');
        if (!sphere) return;

        const y = sphere.body.position.y;
        const velocity = sphere.body.velocity.length();

        if (y > 0.5 && y < 20 && velocity < 0.5) {
            this.challengeTimer += 1 / 60;
            document.getElementById('challenge-timer').textContent = this.challengeTimer.toFixed(1);

            if (this.challengeTimer >= 5.0) {
                this.completeChallenge('小球成功悬浮 5 秒！');
            }
        } else {
            this.challengeTimer = 0;
            document.getElementById('challenge-timer').textContent = '0.0';
        }
    }

    checkLandingChallenge() {
        const sphere = this.sceneManager.getObject('obj_landing_sphere');
        const platform = this.sceneManager.getObject('obj_landing_platform');
        
        if (!sphere || !platform) return;

        const dx = Math.abs(sphere.body.position.x - platform.body.position.x);
        const dz = Math.abs(sphere.body.position.z - platform.body.position.z);
        const dy = sphere.body.position.y - platform.body.position.y;

        if (dx < 1.5 && dz < 1.5 && dy > 0.4 && dy < 1.0 && sphere.body.velocity.length() < 0.1) {
            this.completeChallenge('完美着陆！');
        }
    }

    completeChallenge(message) {
        this.activeChallenge = null;
        document.getElementById('challenge-timer').classList.remove('visible');
        
        if (this.physics.isRunning) {
            this.ui.togglePlay();
        }

        document.getElementById('success-message').textContent = message;
        document.getElementById('success-modal').classList.add('active');
    }

    onWindowResize() {
        const container = document.getElementById('canvas-container');
        this.camera.aspect = container.clientWidth / container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(container.clientWidth, container.clientHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        this.controls.update();

        if (this.physics.isRunning) {
            this.physics.step(1 / 60);
            this.sceneManager.updateRules(this.physics);
            this.checkChallengeComplete();
        }

        for (const [id, obj] of this.sceneManager.objects) {
            obj.mesh.position.copy(obj.body.position);
            obj.mesh.quaternion.copy(obj.body.quaternion);
        }

        if (this.sceneManager.selectedObjectId) {
            this.ui.updateSelectedObject();
        }

        this.renderer.render(this.scene, this.camera);
    }
}

const app = new App();
