// 1. 初期設定
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 3, 10);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; 
controls.target.set(0, 2, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);

// 2. テクスチャ生成
function createEyeTexture(type) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#000000';
    if(type === 'anime01') {
        ctx.beginPath(); ctx.ellipse(64, 64, 20, 35, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(192, 64, 20, 35, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(64, 45, 8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(192, 45, 8, 0, Math.PI * 2); ctx.fill();
    } else if(type === 'anime02') {
        ctx.fillRect(40, 40, 48, 20); ctx.fillRect(168, 40, 48, 20);
    } else if(type === 'anime03') {
        ctx.lineWidth = 8; ctx.strokeStyle = '#000';
        ctx.beginPath(); ctx.arc(64, 70, 25, Math.PI, Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.arc(192, 70, 25, Math.PI, Math.PI*2); ctx.stroke();
    }
    return new THREE.CanvasTexture(canvas);
}

function createMouthTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#000'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(64, 10, 20, 0, Math.PI); ctx.stroke();
    return new THREE.CanvasTexture(canvas);
}

// 3. キャラクター生成
let characterGroup = null;
let animatedParts = {};
// ★ 修正：初期データに earType: "human" を追加
let characterData = { headScaleY: 1.1, headScaleX: 1.0, jawWidth: 0.8, eyeType: "anime01", hairType: "short01", bodyColor: "#ffe0c0", bustSize: 0.5, earType: "human", bustProtrude: 0.33, shirtColor: "#ffffff", pantsColor: "none", bootsColor: "none", hasSword: false };

// 剣の基本姿勢（右手で握った状態。切っ先は正面・縦持ち）
// ポーズごとの swordTiltX はこのX値に加算される追加の上下チルト
const SWORD_BASE_ROTATION = { x: Math.PI / 2, y: Math.PI / 2, z: 0.1 };

function createCharacter(data) {
    if (characterGroup) scene.remove(characterGroup);
    characterGroup = new THREE.Group();
    animatedParts = { arms: [], legs: [] };

    // ★ 位置変更：おにぎり型（卵型）を作る共通関数を、頭や耳の処理でも使えるように上に移動しました
    function createEggGeo(scaleX, scaleY, scaleZ, taperY) {
        const geo = new THREE.SphereGeometry(1, 32, 32);
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
            let x = p.getX(i); let y = p.getY(i); let z = p.getZ(i);
            let taper = 1.0 - (y * taperY); 
            p.setX(i, x * scaleX * taper);
            p.setY(i, y * scaleY);
            p.setZ(i, z * scaleZ); 
        }
        geo.computeVertexNormals();
        return geo;
    }

    const skinMat = new THREE.MeshLambertMaterial({ color: data.bodyColor });
    const clothesMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const hairMat = new THREE.MeshLambertMaterial({ color: 0x333333 });

    // --- 頭 ---
    const headGeo = new THREE.SphereGeometry(1, 32, 32);
    const pos = headGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i);
        if (y < 0) {
            let factor = 1.0 - (Math.abs(y) * (1.0 - data.jawWidth));
            pos.setX(i, pos.getX(i) * factor); 
            pos.setZ(i, pos.getZ(i) * factor + Math.abs(y) * 0.12); 
        }
    }
    headGeo.computeVertexNormals();
    const head = new THREE.Mesh(headGeo, skinMat);
    head.scale.set(data.headScaleX, data.headScaleY, data.headScaleX);
    // 頭の下端を固定（y≈2.95）して上方向にのみ伸ばす
    // center.y = 下端 + 半径(≈0.7) * scaleY
    const headBaseY = 2.87; // 頭側球体中心(2.87)＝頭が半分埋まる
    const headRadius = 0.70;
    head.position.set(0, headBaseY + headRadius * data.headScaleY, 0.15);
    head.rotation.x = 0.05; 
    animatedParts.head = head;

    const eyeMat = new THREE.MeshBasicMaterial({ map: createEyeTexture(data.eyeType), transparent: true });
    const eyes = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9), eyeMat);
    eyes.position.set(0, -0.05, 1.02); head.add(eyes);

    const mouthMat = new THREE.MeshBasicMaterial({ map: createMouthTexture(), transparent: true });
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), mouthMat);
    mouth.position.set(0, -0.45, 0.98); head.add(mouth);

    // ★ 追加箇所：耳の生成ロジック
    if (data.earType === 'human' || data.earType === 'elf') {
        let earGeo;
        if (data.earType === 'human') {
            // 人間の耳：少しふっくらしたおにぎり型
            earGeo = createEggGeo(0.14, 0.24, 0.16, 0.3);
        } else {
            // エルフの耳：縦に長く、上がツンと尖ったおにぎり型
            earGeo = createEggGeo(0.14, 0.55, 0.14, 0.65);
        }

        // 左耳 (キャラの左・向かって右)
        const earL = new THREE.Mesh(earGeo, skinMat);
        if (data.earType === 'human') {
            earL.position.set(0.92, -0.1, -0.05);
            earL.rotation.set(0.1, -0.2, -0.2); // ほんのり前傾
        } else {
            earL.position.set(0.92, 0.05, -0.15);
            earL.rotation.set(-0.15, -0.4, -0.6); // 外側・後ろに流すように尖らせる
        }
        head.add(earL);

        // 右耳 (キャラの右・向かって左)
        const earR = new THREE.Mesh(earGeo, skinMat);
        if (data.earType === 'human') {
            earR.position.set(-0.92, -0.1, -0.05);
            earR.rotation.set(0.1, 0.2, 0.2);
        } else {
            earR.position.set(-0.92, 0.05, -0.15);
            earR.rotation.set(-0.15, 0.4, 0.6);
        }
        head.add(earR);
    }

    // --- 髪の毛 ---
    const hairGroup = new THREE.Group();
    hairGroup.add(new THREE.Mesh(new THREE.SphereGeometry(1.05, 32, 32, 0, Math.PI * 2, 0, Math.PI / 1.95), hairMat));
    
    if (data.hairType === 'short01') {
        const sideGeo = new THREE.ConeGeometry(0.25, 0.8, 16);
        const sideL = new THREE.Mesh(sideGeo, hairMat); sideL.position.set(0.95, -0.4, 0.1); sideL.rotation.z = -0.3;
        const sideR = new THREE.Mesh(sideGeo, hairMat); sideR.position.set(-0.95, -0.4, 0.1); sideR.rotation.z = 0.3;
        hairGroup.add(sideL, sideR);
    }
    head.add(hairGroup); characterGroup.add(head);

    if (data.hairType === 'long01') {
        // ロングヘアーの背中側の流れは頭ではなく胴体（characterGroup）に固定する。
        // 頭にぶら下げると、ポーズで頭が傾いた時に毛先がシャツ/ズボンへ
        // 突き刺さるように見えてしまうため、背中に流れる房は体側に固定し
        // 頭の傾きの影響を受けないようにする。
        const headWorldY = headBaseY + headRadius * data.headScaleY;
        const backHairAnchorY = headWorldY + 0.2;
        const backHairAnchorZ = 0.15 - 0.45; // head.position.zオフセット + 元のhairGroup内オフセット

        const backHairGeo = new THREE.CylinderGeometry(1.05, 0.95, 3.2, 32);
        backHairGeo.translate(0, -1.6, 0); 
        const backHair = new THREE.Mesh(backHairGeo, hairMat);
        backHair.position.set(0, backHairAnchorY, backHairAnchorZ); 
        backHair.rotation.x = 0.12;           
        backHair.scale.z = 0.55;              
        characterGroup.add(backHair);

        const hairJoint = new THREE.Mesh(new THREE.SphereGeometry(1.05, 32, 32), hairMat);
        hairJoint.position.set(0, backHairAnchorY, backHairAnchorZ); 
        hairJoint.scale.z = 0.55;              
        characterGroup.add(hairJoint);
    }

    // 首：胸側球体 + 円筒 + 頭側球体 の3パーツ構成
    // 半径r=0.27、円筒長さ=直径=0.54
    // 配置: 胸上端(chest y=2.0, chestR≈0.42)に胸側球体を接続
    //   胸側球体中心 y = 2.42
    //   円筒中心     y = 2.42 + 0.27 + 0.27 = 2.96 → (2.42+0.27) + 0.27 = 2.96
    //   頭側球体中心 y = 2.42 + 0.54 + 0.54 = 3.50
    const neckR = 0.27;
    const neckCylLen = neckR * 2 / 3; // 0.18（円筒部分の長さ）

    const neckGroup = new THREE.Group();
    neckGroup.position.set(0, 0, 0.03);
    characterGroup.add(neckGroup);

    // 円筒の下端y・上端y
    const neckCylBottom = 2.42 + neckR; // 胸側半球の中心と同じ高さ
    const neckCylTop    = neckCylBottom + neckCylLen;

    // 胸側半球：円筒下端に中心を合わせ → 下半分が胸部に埋まり、上半分が円筒端を閉じる
    const neckBottomGeo = new THREE.SphereGeometry(neckR, 16, 8);
    const neckBottom = new THREE.Mesh(neckBottomGeo, skinMat);
    neckBottom.position.set(0, neckCylBottom, 0);
    neckGroup.add(neckBottom);

    // 円筒本体
    const neckCylGeo = new THREE.CylinderGeometry(neckR, neckR, neckCylLen, 16, 1, true); // openEnded
    const neckCyl = new THREE.Mesh(neckCylGeo, skinMat);
    neckCyl.position.set(0, neckCylBottom + neckCylLen * 0.5, 0);
    neckGroup.add(neckCyl);

    // 頭側半球：円筒上端に中心を合わせ → 上半分が頭部に埋まり、下半分が円筒端を閉じる
    const neckTopGeo = new THREE.SphereGeometry(neckR, 16, 8);
    const neckTop = new THREE.Mesh(neckTopGeo, skinMat);
    neckTop.position.set(0, neckCylTop, 0);
    neckGroup.add(neckTop);

    animatedParts.neck = neckGroup;

    // --- 胴体 ---
    // 臀部：胸部と同じ形状・サイズ
    const pelvisGeo = new THREE.SphereGeometry(0.52, 20, 16);
    const pelvis = new THREE.Mesh(pelvisGeo, skinMat);
    pelvis.scale.set(1.15, 0.80, 0.72); // 胸部と同じ楕円球
    pelvis.position.y = 1.1; 
    characterGroup.add(pelvis);

    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 16), skinMat); 
    belly.scale.set(1.0, 1.0, 0.72); // 前後を薄くして背中から飛び出さないように
    belly.position.y = 1.5; 
    animatedParts.belly = belly;
    characterGroup.add(belly);

    // chest: 前後につぶれた楕円球（X広め・Y中・Z薄め）
    const chestGeo = new THREE.SphereGeometry(0.52, 20, 16);
    const chest = new THREE.Mesh(chestGeo, skinMat);
    chest.scale.set(1.15, 0.80, 0.72); // 横広・前後薄の楕円球
    chest.position.y = 2.0; 
    animatedParts.chest = chest;
    characterGroup.add(chest);

    // --- 服グループ ---
    // clothesGroupはbodyGroupと完全に分離した独立グループ
    // 将来「鎧」「ローブ」等への拡張もここに追加するだけでOK
    // ズボンを先に追加し、シャツを後から上に重ねる
    // ズボンはcreateLeg()内でボーン直下に生成済み
    // ヒップ（pelvis）部のズボンはcharacterGroup直下に追加
    if (data.pantsColor && data.pantsColor !== 'none') {
        const pantsMat = new THREE.MeshLambertMaterial({ color: data.pantsColor });
        // pelvis を隠す
        pelvis.visible = false;
        // pelvisを包むズボンヒップ
        const pPelvisGeo = new THREE.SphereGeometry(0.52, 20, 16);
        const pPelvis = new THREE.Mesh(pPelvisGeo, pantsMat);
        pPelvis.scale.set(1.20, 0.82, 0.76);
        pPelvis.position.y = 1.1;
        characterGroup.add(pPelvis);
        // ウエスト帯は削除（bellyまで食い込むため）
    }
    if (data.shirtColor && data.shirtColor !== 'none') {
        const sg = createTShirt(data.shirtColor, characterGroup, data);
        if (sg) sg.renderOrder = 2;
    }

    // 胸の大きさ（バスト）の表現
    if (data.bustSize > 0) {
        const b = data.bustSize;
        const bustRadius = 0.22 * b; // 胸球体の半径
        // 飛び出し量の上限 = 半径の2/3（それ以上は球体が露出して不自然）
        const pRaw = data.bustProtrude;
        const pMax = bustRadius; // 最大=半球（球体の半径分だけ前に出る）
        const p = Math.min(pRaw, pMax);
        const bustGeo = new THREE.SphereGeometry(bustRadius, 16, 16); // 完全な球体

        // 左胸
        const bustL = new THREE.Mesh(bustGeo, skinMat);
        bustL.position.set(0.17, -0.05, p); 
        bustL.rotation.x = Math.PI / 2.2;     
        bustL.rotation.y = -0.15;             
        bustL.rotation.z = -0.2;              
        chest.add(bustL);

        // 右胸
        const bustR = new THREE.Mesh(bustGeo, skinMat);
        bustR.position.set(-0.17, -0.05, p); 
        bustR.rotation.x = Math.PI / 2.2;
        bustR.rotation.y = 0.15;              
        bustR.rotation.z = 0.2;               
        chest.add(bustR);
    }

    // --- 関節ジオメトリ ---
    const bigJointGeo = new THREE.SphereGeometry(0.2, 16, 16); 
    const smallJointGeo = new THREE.SphereGeometry(0.16, 16, 16); 

    // ★ 修正：腕用と脚用でジオメトリを別々に生成する
    // translate()はジオメトリ自体を書き換える破壊的操作のため、共有すると2つ目がずれるバグがあった
    function createLimbGeo() {
        const geo = new THREE.CylinderGeometry(0.16, 0.13, 0.8, 16);
        geo.translate(0, -0.4, 0);
        return geo;
    }

    function createArm(xPos) {
        const shoulder = new THREE.Mesh(bigJointGeo, skinMat); 
        shoulder.position.set(xPos, 2.15, 0); // 肩を下げてなで肩に
        const upperArm = new THREE.Mesh(createLimbGeo(), skinMat); 
        shoulder.add(upperArm);
        const elbow = new THREE.Mesh(smallJointGeo, skinMat); 
        elbow.position.set(0, -0.8, 0);
        upperArm.add(elbow);
        const foreArm = new THREE.Mesh(createLimbGeo(), skinMat); 
        elbow.add(foreArm);
        const wrist = new THREE.Mesh(smallJointGeo, skinMat); 
        wrist.position.set(0, -0.8, 0);
        foreArm.add(wrist);
        characterGroup.add(shoulder);
        return { root: shoulder, joint: elbow, wrist: wrist };
    }

    // ── 小道具：剣（右手用） ──
    // シンプルなプリミティブ（柄+鍔+刃）で構成した剣を1つのグループにまとめる
    function createSword() {
        const sword = new THREE.Group();
        sword.name = 'swordRight';

        const handleMat = new THREE.MeshLambertMaterial({ color: 0x4a3320 }); // 柄：茶色
        const guardMat   = new THREE.MeshLambertMaterial({ color: 0xc8a020 }); // 鍔：金色
        const bladeMat   = new THREE.MeshLambertMaterial({ color: 0xd8dce0 }); // 刃：銀色

        // 柄（グリップ）：握り込む部分。wristのローカルY軸下方向に伸ばす
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 12), handleMat);
        handle.position.set(0, 0, 0);
        sword.add(handle);

        // 鍔（ガード）：柄と刃の境目。幅広の大剣らしく横に張り出す
        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.1), guardMat);
        guard.position.set(0, 0.215, 0);
        sword.add(guard);

        // 刃：鍔から上に伸びる、幅広で厚みのある刀身
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.5, 0.045), bladeMat);
        blade.position.set(0, 0.98, 0);
        sword.add(blade);

        // 刃先（先端を尖らせる）：剣身と同じ幅・厚みの平たい三角形を押し出して作る（円錐だと槍のように見えるため）
        const tipWidth = 0.2;   // 刃の幅と同じ
        const tipHeight = 0.22;
        const tipThickness = 0.045; // 刃の厚みと同じ
        const tipShape = new THREE.Shape();
        tipShape.moveTo(-tipWidth / 2, 0);
        tipShape.lineTo(tipWidth / 2, 0);
        tipShape.lineTo(0, tipHeight);
        tipShape.closePath();
        const tipGeo = new THREE.ExtrudeGeometry(tipShape, { depth: tipThickness, bevelEnabled: false });
        tipGeo.translate(0, 0, -tipThickness / 2); // 厚みの中心を原点に合わせる
        const tip = new THREE.Mesh(tipGeo, bladeMat);
        tip.position.set(0, 1.73, 0);
        sword.add(tip);

        return sword;
    }

    function createLeg(xPos, pelvisMesh, pantsColor) {
        const hasPants = pantsColor && pantsColor !== 'none';
        const pantsMat = hasPants ? new THREE.MeshLambertMaterial({ color: pantsColor }) : null;
        const hipR = 0.22;

        // ── hipはGroupにしてMeshを子にする（visible=falseの連鎖を防ぐ） ──
        const hip = new THREE.Group();
        hip.position.set(xPos, 0.54, 0.0);

        const hipMesh = new THREE.Mesh(new THREE.SphereGeometry(hipR, 16, 16), skinMat);
        hipMesh.visible = !hasPants;
        hip.add(hipMesh);

        // 膝関節：Groupにする
        const kneeR = 0.15;
        const knee = new THREE.Group();
        knee.position.set(0, -0.85, 0);
        hip.add(knee);

        const kneeMesh = new THREE.Mesh(new THREE.SphereGeometry(kneeR, 16, 16), skinMat);
        kneeMesh.visible = !hasPants;
        knee.add(kneeMesh);

        // 太もも
        const thighLen = 0.85;
        const thighTopR  = hipR * 1.1;
        const thighBotR  = kneeR * 0.75;
        const thighGeo = new THREE.CylinderGeometry(thighTopR, thighBotR, thighLen, 16);
        thighGeo.translate(0, -thighLen / 2, 0);
        const thigh = new THREE.Mesh(thighGeo, skinMat);
        thigh.visible = !hasPants;
        hip.add(thigh);

        // ふくらはぎ
        const calfLen = 0.85;
        const calfTopR  = kneeR * 0.85;
        const calfBotR  = 0.13;
        const calfGeo = new THREE.CylinderGeometry(calfTopR, calfBotR, calfLen, 16);
        calfGeo.translate(0, -calfLen / 2, 0);
        const calf = new THREE.Mesh(calfGeo, skinMat);
        calf.visible = !hasPants;
        knee.add(calf);

        // ── 足首（関節球体） ──
        const ankleR = 0.14;
        const ankle = new THREE.Mesh(new THREE.SphereGeometry(ankleR, 16, 16), skinMat);
        ankle.position.set(0, -calfLen, 0);
        knee.add(ankle);

        // ── ズボンパーツ（ボーン直下でポーズ追従） ──
        if (hasPants) {
            // ヒップ（hip球体を包む）
            const pHipGeo = new THREE.SphereGeometry(hipR + 0.045, 16, 16);
            const pHip = new THREE.Mesh(pHipGeo, pantsMat);
            pHip.position.set(0, 0, 0); // hip原点に合わせる
            hip.add(pHip);

            // 太もも（thighを包む円錐台）
            const pThighGeo = new THREE.CylinderGeometry(
                thighTopR + 0.04, thighBotR + 0.04, thighLen, 20);
            pThighGeo.translate(0, -thighLen / 2, 0);
            const pThigh = new THREE.Mesh(pThighGeo, pantsMat);
            hip.add(pThigh);

            // 膝（knee球体を包む）
            const pKneeGeo = new THREE.SphereGeometry(kneeR + 0.04, 16, 16);
            const pKnee = new THREE.Mesh(pKneeGeo, pantsMat);
            pKnee.position.set(0, -0.85, 0); // knee.position と同じ
            hip.add(pKnee);

            // すね（calfを包む円錐台）
            const pCalfGeo = new THREE.CylinderGeometry(
                calfTopR + 0.04, calfBotR + 0.04, calfLen, 20);
            pCalfGeo.translate(0, -calfLen / 2, 0);
            const pCalf = new THREE.Mesh(pCalfGeo, pantsMat);
            // knee直下のcalfと同じ座標系
            knee.add(pCalf);

            // 裾（すね下端を閉じる円盤）
            const pHemGeo = new THREE.CircleGeometry(calfBotR + 0.04, 20);
            const pHem = new THREE.Mesh(pHemGeo, pantsMat);
            pHem.rotation.x = Math.PI / 2;
            pHem.position.set(0, -calfLen, 0);
            knee.add(pHem);
        }

        // ── 足グループ（ankle直下・ポーズ追従） ──
        const foot = new THREE.Group();
        foot.position.set(0, -0.10, +0.18);
        ankle.add(foot);

        // ── 素足グループ ──
        const bareFootGroup = new THREE.Group();
        foot.add(bareFootGroup);

        // 【土台】扁平球体
        const soleSphere = new THREE.SphereGeometry(0.20, 20, 14);
        const sole = new THREE.Mesh(soleSphere, skinMat);
        sole.scale.set(0.95, 0.35, 1.6);
        sole.position.set(0, 0, +0.08);
        bareFootGroup.add(sole);

        // 【甲の盛り上がり】
        const instepGeo = new THREE.SphereGeometry(0.18, 16, 12);
        const instep = new THREE.Mesh(instepGeo, skinMat);
        instep.scale.set(0.80, 0.65, 1.55);
        instep.position.set(0, 0.08, +0.04);
        instep.rotation.x = 0.25;
        bareFootGroup.add(instep);

        // ── 長靴グループ（ankle親子でポーズ追従） ──
        const bootGroup = new THREE.Group();
        foot.add(bootGroup);

        // ankle基準でのオフセット（foot.position反映済み座標系）
        // foot原点=かかと付近、前方+Z、上方+Y
        const BOOT_Z = +0.10; // foot座標系でのZ中心

        const bootsColor = data.bootsColor && data.bootsColor !== 'none' ? data.bootsColor : null;

        if (bootsColor) {
            const bootsMat = new THREE.MeshLambertMaterial({ color: bootsColor });

            // ── ソール（足裏の厚底） ──
            const soleRx = 0.24, soleRz = 0.54, soleH = 0.20;
            const soleGeo = new THREE.CylinderGeometry(soleRx, soleRx, soleH, 24, 1, false);
            const sPos = soleGeo.attributes.position;
            for (let i = 0; i < sPos.count; i++) sPos.setZ(i, sPos.getZ(i) * (soleRz / soleRx));
            sPos.needsUpdate = true;
            soleGeo.computeVertexNormals();
            const bootSole = new THREE.Mesh(soleGeo, bootsMat);
            bootSole.position.set(0, -0.18, BOOT_Z);
            bootGroup.add(bootSole);

            // ソール底面
            const soleBotGeo = new THREE.CircleGeometry(soleRx, 24);
            const soleBotMesh = new THREE.Mesh(soleBotGeo, bootsMat);
            soleBotMesh.rotation.x = -Math.PI / 2;
            soleBotMesh.scale.set(1, soleRz / soleRx, 1);
            soleBotMesh.position.set(0, -0.28, BOOT_Z);
            bootGroup.add(soleBotMesh);

            // ── トゥ（足先を覆う楕円筒） ──
            const toeRx = 0.22, toeRz = 0.54, toeH = 0.28;
            const toeGeo = new THREE.CylinderGeometry(toeRx, toeRx, toeH, 20, 1, false);
            const tPos = toeGeo.attributes.position;
            for (let i = 0; i < tPos.count; i++) tPos.setZ(i, tPos.getZ(i) * (toeRz / toeRx));
            tPos.needsUpdate = true;
            toeGeo.computeVertexNormals();
            const toe = new THREE.Mesh(toeGeo, bootsMat);
            toe.position.set(0, -0.06, BOOT_Z);
            bootGroup.add(toe);

            // ── シャフト（足首〜すねの筒）──
            // foot座標系: ankleはfoot親の上なのでシャフトはanкleへ直接追加
            const shaftH = 0.55, shaftR = 0.19;
            const shaftGeo = new THREE.CylinderGeometry(shaftR, shaftR, shaftH, 20);
            const shaft = new THREE.Mesh(shaftGeo, bootsMat);
            // ankleの子として追加（foot座標系から抜けてankle直下に）
            shaft.position.set(0, -calfLen + shaftH / 2, 0);
            knee.add(shaft); // knee直下のankleと同じ親

            // 履き口
            const cuffGeo = new THREE.CylinderGeometry(shaftR + 0.015, shaftR, 0.04, 20);
            const cuff = new THREE.Mesh(cuffGeo, bootsMat);
            cuff.position.set(0, -calfLen + shaftH - 0.02, 0);
            knee.add(cuff);
        }

        // 表示切替
        bareFootGroup.visible = !(data.bootsColor && data.bootsColor !== 'none');
        bootGroup.visible     =  (data.bootsColor && data.bootsColor !== 'none');

        pelvisMesh.parent ? pelvisMesh.parent.add(hip) : characterGroup.add(hip);
        return { root: hip, joint: knee };
    }

    animatedParts.arms.push(createArm(0.65));  
    animatedParts.arms.push(createArm(-0.65)); 
    animatedParts.legs.push(createLeg(0.378,  pelvis, data.pantsColor)); 
    animatedParts.legs.push(createLeg(-0.378, pelvis, data.pantsColor)); 

    // ── 小道具：右手に剣を持たせる ──
    if (data.hasSword) {
        const sword = createSword();
        // arms[1] = 右腕。wristの子にすることで腕の動き・ポーズに追従する
        animatedParts.arms[1].wrist.add(sword);
        // 握りやすいよう基本姿勢を設定（ポーズごとにswordTiltXで上下に調整される）
        sword.rotation.set(SWORD_BASE_ROTATION.x, SWORD_BASE_ROTATION.y, SWORD_BASE_ROTATION.z);
        animatedParts.sword = sword;
    } else {
        animatedParts.sword = null;
    }

    // 長靴はcreateLeg()内でankle親子として生成済み

    scene.add(characterGroup);
}

createCharacter(characterData);

// ============================================================
// createTShirt() — 服生成関数
// ============================================================
// 【設計方針】
//   ・body（素体）と完全分離。新しいMesh/Geometry/Materialで構成
//   ・clothesGroup を characterGroup の子として追加
//   ・胴体：頂点変形で胸部を前方に押し出し自然な膨らみを表現
//   ・袖：左右別Meshで肩関節の子にする（腕回転に追従）
//   ・将来「鎧」「ローブ」等を追加するときはこの関数を参考に
// ============================================================
function createTShirt(color, targetGroup, data) {

    // ── マテリアル ──────────────────────────────────────────
    const shirtMat = new THREE.MeshLambertMaterial({
        color: color,
        side: THREE.DoubleSide,
    });

    // ── clothesGroup：服全体をまとめるグループ ──────────────
    const clothesGroup = new THREE.Group();
    clothesGroup.name = 'clothesGroup';

    // ============================================================
    // 【胴体 上部】半楕円ドーム＋首穴
    // 設計図①: 胸部楕円の上側を微増した半楕円スキン
    // 設計図②: 中央に首球体半径(neckR=0.27)の穴
    // ============================================================
    // chest上端y≈2.42、ドーム半径≈0.68（肩をカバー）
    const domeY    = 2.10;  // ドーム底面（首が見えるよう下げる）
    const domeR    = 0.68;  // 横半径（肩をカバー）
    const domeH    = 0.38;  // ドームの高さ（半楕円）
    const neckHole = 0.30;  // 首穴半径（neckR=0.27より少し大きめ）
    const segments = 32;

    // SphereGeometryの上半分を使ってドームを作る
    // phiStart=0, phiLength=π → 上半球
    // 首穴：thetaStart=arcsin(neckHole/domeR)で中央を開ける
    const domeGeo = new THREE.SphereGeometry(
        domeR,      // radius
        segments,   // widthSegments
        16,         // heightSegments
        0,          // phiStart
        Math.PI * 2,// phiLength（全周）
        Math.asin(neckHole / domeR), // thetaStart：首穴の角度から始める
        Math.PI / 2 // thetaLength：上半球のみ
    );
    // Y方向をdomeH/domeRで圧縮して半楕円に
    // Z方向を0.72倍で前後を薄く
    const domePos = domeGeo.attributes.position;
    for (let i = 0; i < domePos.count; i++) {
        domePos.setY(i, domePos.getY(i) * (domeH / domeR));
        domePos.setZ(i, domePos.getZ(i) * 0.72);
    }
    domePos.needsUpdate = true;
    domeGeo.computeVertexNormals();

    const dome = new THREE.Mesh(domeGeo, shirtMat);
    dome.name = 'shirtDome';
    dome.position.y = domeY;
    clothesGroup.add(dome);

    // 首穴の縁取り（TorusGeometry）
    const collarGeo = new THREE.TorusGeometry(neckHole, 0.035, 8, 32);
    const collar = new THREE.Mesh(collarGeo, shirtMat);
    collar.name = 'shirtCollar';
    collar.rotation.x = Math.PI / 2; // 水平に寝かせる
    collar.position.y = domeY + domeH * 0.95;
    clothesGroup.add(collar);

    // ============================================================
    // 【胴体 下部】ドーム底面(y=domeY)から股下(y=0.65)まで円錐台
    // 設計図③: 楕円端から股下まで円錐台を伸ばす
    // ============================================================
    const skirtH   = domeY - 0.65;  // ≈1.77
    const skirtGeo = new THREE.CylinderGeometry(
        domeR,        // radiusTop: ドーム底面と同じ半径
        domeR * 0.92, // radiusBottom: 裾は少し絞る
        skirtH,
        segments,
        1,
        true  // openEnded
    );
    // Z方向を0.72倍にして楕円断面
    const skirtPos = skirtGeo.attributes.position;
    for (let i = 0; i < skirtPos.count; i++) {
        skirtPos.setZ(i, skirtPos.getZ(i) * 0.72);
    }
    skirtPos.needsUpdate = true;
    skirtGeo.computeVertexNormals();

    const skirt = new THREE.Mesh(skirtGeo, shirtMat);
    skirt.name = 'shirtSkirt';
    skirt.position.y = domeY - skirtH / 2;
    clothesGroup.add(skirt);

    // ============================================================
    // 【胸カバー】bustSize連動で胸球体を服色で覆う
    // ① 左右の胸の間を埋める円柱（谷間カバー）
    // ② 左右それぞれ外側を服色球体で覆う
    // chest(y=2.0)の子 bustL/R の位置に合わせる
    // bustL: position(+0.26, 0.15, p), bustR: position(-0.26, 0.15, p)
    // ============================================================
    if (data.bustSize > 0) {
        const b   = data.bustSize;
        const p   = data.bustProtrude;
        const br  = 0.22 * b;       // 胸球体の半径
        const cr  = br * 1.08;      // カバー半径（胸より少し大き目）

        // chestメッシュを探す（y≈2.0）
        let chestMesh = null;
        targetGroup.traverse(obj => {
            if (obj.isMesh && Math.abs(obj.position.y - 2.0) < 0.05
                && !obj.name.startsWith('shirt')) {
                chestMesh = obj;
            }
        });

        if (chestMesh) {
            // ① 谷間円柱：左右胸中心(x=±0.26)の間を埋める
            //    半径=cr、高さ=左右間距離(0.52)、中心x=0
            const bridgeGeo = new THREE.CylinderGeometry(cr, cr, 0.36, 20);
            bridgeGeo.rotateZ(Math.PI / 2); // X方向に横倒し
            const bridge = new THREE.Mesh(bridgeGeo, shirtMat);
            bridge.name = 'bustBridge';
            bridge.position.set(0, -0.05, p);
            chestMesh.add(bridge);
            clothesGroup.userData.bustBridge = bridge;

            // ② 左右それぞれ外側を球体で覆う
            const coverGeoL = new THREE.SphereGeometry(cr, 16, 16);
            const coverL = new THREE.Mesh(coverGeoL, shirtMat);
            coverL.name = 'bustCoverL';
            coverL.position.set(0.17, -0.05, p);
            chestMesh.add(coverL);

            const coverGeoR = new THREE.SphereGeometry(cr, 16, 16);
            const coverR = new THREE.Mesh(coverGeoR, shirtMat);
            coverR.name = 'bustCoverR';
            coverR.position.set(-0.17, -0.05, p);
            chestMesh.add(coverR);

            // clothesGroupに参照を保持（削除時に使用）
            clothesGroup.userData.bustCovers = [bridge, coverL, coverR];
        }
    }

    targetGroup.add(clothesGroup);

    // ============================================================
    // 【袖】左右別Mesh — 肩関節(shoulder)の子として追加
    // 理由：腕の回転アニメーションに自動追従させるため
    // ============================================================
    // shoulderは createArm() 内で characterGroup に add されている
    // ここでは characterGroup の子を走査して肩を探す
    function addSleeve(shoulderMesh, side) {
        // 半袖：短い開口円筒
        const sleeveGeo = new THREE.CylinderGeometry(
            0.24,  // 上端（肩側）：肩関節を余裕を持って覆う
            0.21,  // 下端（腕側）：腕に向かってやや細く
            0.42,  // 長さ
            16, 1, true // openEnded
        );
        // 袖口（下端）をふさぐ円
        const cuffGeo = new THREE.CircleGeometry(0.21, 16);

        const sleeve = new THREE.Mesh(sleeveGeo, shirtMat);
        const cuff   = new THREE.Mesh(cuffGeo, shirtMat);
        sleeve.name = `sleeve_${side}`;
        cuff.name   = `cuff_${side}`;

        // 円筒を腕方向（X軸）に向ける
        sleeve.rotation.z = Math.PI / 2;
        cuff.rotation.z   = Math.PI / 2;

        // 肩関節中心から腕方向にオフセット
        const offsetX = (side === 'L') ? 0.21 : -0.21;
        sleeve.position.set(offsetX, 0, 0);
        cuff.position.set(offsetX * 2, 0, 0);

        shoulderMesh.add(sleeve);
        shoulderMesh.add(cuff);
    }

    // characterGroup 直下の Mesh を走査して肩(y≈2.3)を特定
    targetGroup.children.forEach(child => {
        if (child.isMesh && Math.abs(child.position.y - 2.15) < 0.05) {
            if (child.position.x > 0) {
                addSleeve(child, 'L');
            } else if (child.position.x < 0) {
                addSleeve(child, 'R');
            }
        }
    });

    return clothesGroup; // 参照を返す（削除・切り替え用）
}


// ============================================================
// ============================================================
// 【構造】
// ============================================================

// 4.// 4. イベントリスナーとアニメーション
// ★ 修正：監視対象の配列の最後に 'earType' を追加しました
['headScaleY', 'headScaleX', 'jawWidth', 'eyeType', 'hairType', 'bodyColor', 'bustSize', 'bustProtrude', 'earType', 'shirtColor', 'pantsColor', 'bootsColor'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('input', (e) => {
            let val = e.target.value;
            if(el.type === 'range') val = parseFloat(val);
            characterData[id] = val; 
            if (id === 'bodyColor') {
                // カスタムカラーを選んだらプリセットボタンのハイライトを外す
                document.querySelectorAll('#skinPresetNormal, #skinPresetTan, #skinPresetFair').forEach(b => b.classList.remove('active'));
            }
            createCharacter(characterData);
        });
    }
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix(); 
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================
// ポーズシステム
// ============================================================

// アイドルアニメON/OFFフラグ
let idleEnabled = true;
window.setIdle = function(val) {
    idleEnabled = val;
    document.getElementById('idleOnBtn').classList.toggle('active', val);
    document.getElementById('idleOffBtn').classList.toggle('active', !val);
    if (val) {
        // ON：補間を完了済みにしてアイドルアニメへ即切替
        poseT      = 1.0;
        poseTarget = null;
        poseFrom   = null;
        // ポーズボタンのactiveを外す
        document.querySelectorAll('.pose-btn').forEach(b => b.classList.remove('active'));
    } else {
        // OFF：現ポーズを即適用
        applyPose(currentPose);
    }
};

// ============================================================
// シーケンス再生システム
// ============================================================
let seqFrames = null;
let seqIndex  = 0;
let seqTimer  = 0;

function startSequence(frames) {
    seqFrames = frames;
    seqIndex  = 0;
    seqTimer  = 0;
    idleEnabled = false;
    document.getElementById('idleOnBtn').classList.remove('active');
    document.getElementById('idleOffBtn').classList.add('active');
    applyPose(seqFrames[0].pose);
}

function tickSequence(dt) {
    if (!seqFrames) return;
    seqTimer += dt;
    const cur = seqFrames[seqIndex];
    if (seqTimer >= cur.duration) {
        seqTimer -= cur.duration;
        seqIndex++;
        if (seqIndex >= seqFrames.length) {
            seqFrames = null;
            return;
        }
        applyPose(seqFrames[seqIndex].pose);
    }
}

// ── 単体ポーズ（シーケンスから参照） ──
const POSE_STAND = {
    head: { rx: 0, ry: 0, rz: 0 },
    arms: [
        { root: { rx: 0, ry: 0, rz:  0.15 }, joint: { rx: 0, rz: 0 } },
        { root: { rx: 0, ry: 0, rz: -0.15 }, joint: { rx: 0, rz: 0 } },
    ],
    legs: [
        { root: { rx: 0, rz:  0.05 }, joint: { rx: 0 } },
        { root: { rx: 0, rz: -0.05 }, joint: { rx: 0 } },
    ],
};
const POSE_KICK_READY = {
    head:  { rx: -0.05, ry: -0.15, rz: 0 },
    arms: [
        { root: { rx: -0.2, ry: 0, rz:  0.6 }, joint: { rx: -0.1, rz: 0 } },
        { root: { rx:  0.3, ry: 0, rz: -0.4 }, joint: { rx: -0.2, rz: 0 } },
    ],
    legs: [
        { root: { rx:  0.05, rz:  0.06 }, joint: { rx:  0.05 } },
        { root: { rx: -0.5,  rz: -0.08 }, joint: { rx:  0.4  } },
    ],
};
const POSE_KICK_HIT = {
    head:  { rx: -0.1, ry: -0.2, rz: 0 },
    arms: [
        { root: { rx: -0.3, ry: 0, rz:  0.8 }, joint: { rx: -0.2, rz: 0 } },
        { root: { rx:  0.5, ry: 0, rz: -0.5 }, joint: { rx: -0.3, rz: 0 } },
    ],
    legs: [
        { root: { rx:  0.15, rz:  0.04 }, joint: { rx:  0.05 } },
        { root: { rx: -1.4,  rz: -0.1  }, joint: { rx: -0.8  } },
    ],
};

// ポーズ定義
// 各値は rotation (x, y, z) in radians
// arms[0]=左腕, arms[1]=右腕 / legs[0]=左脚, legs[1]=右脚
// root=肩/股関節, joint=肘/膝
const POSES = [
    {
        label: '🧍 Tポーズ',
        head:     { rx: 0,     ry: 0,    rz: 0 },
        arms: [
            { root: { rx: 0,    ry: 0,   rz:  1.57 }, joint: { rx: 0, rz: 0 } },
            { root: { rx: 0,    ry: 0,   rz: -1.57 }, joint: { rx: 0, rz: 0 } },
        ],
        legs: [
            { root: { rx: 0,    rz:  0.05 }, joint: { rx: 0 } },
            { root: { rx: 0,    rz: -0.05 }, joint: { rx: 0 } },
        ],
    },
    {
        label: '🙆 万歳',
        head:     { rx: -0.2,  ry: 0,    rz: 0 },
        arms: [
            { root: { rx: -0.2, ry: 0,   rz:  2.8  }, joint: { rx: -0.2, rz: 0 } },
            { root: { rx: -0.2, ry: 0,   rz: -2.8  }, joint: { rx: -0.2, rz: 0 } },
        ],
        legs: [
            { root: { rx: 0,    rz:  0.05 }, joint: { rx: 0 } },
            { root: { rx: 0,    rz: -0.05 }, joint: { rx: 0 } },
        ],
        swordTiltX: 1.0, // 切っ先を上に上げる
    },
    {
        label: '✋ 右手上げ',
        head:     { rx: 0,     ry: -0.3, rz: 0 },
        arms: [
            { root: { rx: 0,    ry: 0,   rz:  0.15 }, joint: { rx: 0,    rz: 0 } },
            { root: { rx: -0.3, ry: 0,   rz: -2.6  }, joint: { rx: -0.3, rz: 0 } },
        ],
        legs: [
            { root: { rx: 0,    rz:  0.05 }, joint: { rx: 0 } },
            { root: { rx: 0,    rz: -0.05 }, joint: { rx: 0 } },
        ],
        swordTiltX: 1.0, // 切っ先を上に上げる（万歳と同じ向き。今後の「右手切下ろし」攻撃の準備姿勢用）
    },
    {
        label: '🤜 ファイト',
        head:     { rx: -0.1,  ry: 0.2,  rz: 0 },
        arms: [
            { root: { rx:  0.4, ry: 0,   rz:  1.0  }, joint: { rx: -1.2, rz: 0 } },
            { root: { rx: -0.6, ry: 0.3, rz: -0.6  }, joint: { rx: -1.4, rz: 0 } },
        ],
        legs: [
            { root: { rx:  0.3, rz:  0.08 }, joint: { rx:  0.2 } },
            { root: { rx: -0.2, rz: -0.08 }, joint: { rx:  0.1 } },
        ],
    },
    {
        label: '🙏 お辞儀',
        head:     { rx:  0.6,  ry: 0,    rz: 0 },
        arms: [
            { root: { rx:  0.8, ry: 0,   rz:  0.2  }, joint: { rx: -0.5, rz: 0 } },
            { root: { rx:  0.8, ry: 0,   rz: -0.2  }, joint: { rx: -0.5, rz: 0 } },
        ],
        legs: [
            { root: { rx: 0,    rz:  0.03 }, joint: { rx: 0 } },
            { root: { rx: 0,    rz: -0.03 }, joint: { rx: 0 } },
        ],
    },
    {
        label: '🦵 右キック',
        head:  { rx: -0.1, ry: -0.2, rz: 0 },
        arms: [
            { root: { rx: -0.3, ry: 0,  rz:  0.8 }, joint: { rx: -0.2, rz: 0 } },
            { root: { rx:  0.5, ry: 0,  rz: -0.5 }, joint: { rx: -0.3, rz: 0 } },
        ],
        legs: [
            { root: { rx:  0.15, rz:  0.04 }, joint: { rx:  0.05 } },
            { root: { rx: -1.4,  rz: -0.1  }, joint: { rx: -0.8  } },
        ],
    },
    {
        label: '🦾 腕組み',
        head:     { rx: -0.05, ry: 0,    rz: 0 },
        arms: [
            { root: { rx:  0.2, ry:-0.4, rz:  0.5  }, joint: { rx: -2.0, rz: 0 } },
            { root: { rx:  0.2, ry: 0.4, rz: -0.5  }, joint: { rx: -2.0, rz: 0 } },
        ],
        legs: [
            { root: { rx: 0,    rz:  0.06 }, joint: { rx: 0 } },
            { root: { rx: 0,    rz: -0.06 }, joint: { rx: 0 } },
        ],
    },
];

// ============================================================
// コマンド定義（シーケンスと単発ポーズを統一管理）
// ============================================================
const COMMANDS = [
    {
        label: '🤸 両腕を広げる',
        isSequence: true,
        frames: [
            { pose: POSE_STAND,      duration: 0.4 },
            { pose: {
                head: { rx: 0, ry: 0, rz: 0 },
                arms: [
                    { root: { rx: 0, ry: 0, rz:  1.57 }, joint: { rx: 0, rz: 0 } },
                    { root: { rx: 0, ry: 0, rz: -1.57 }, joint: { rx: 0, rz: 0 } },
                ],
                legs: [
                    { root: { rx: 0, rz:  0.05 }, joint: { rx: 0 } },
                    { root: { rx: 0, rz: -0.05 }, joint: { rx: 0 } },
                ],
            }, duration: 1.2 },
            { pose: POSE_STAND,      duration: 0.5 },
        ],
    },
    {
        label: '🦵 キックする',
        isSequence: true,
        frames: [
            { pose: POSE_STAND,      duration: 0.3 },
            { pose: POSE_KICK_READY, duration: 0.4 },
            { pose: POSE_KICK_HIT,   duration: 0.5 },
            { pose: POSE_KICK_READY, duration: 0.3 },
            { pose: POSE_STAND,      duration: 0.5 },
        ],
    },
];

let currentPose = POSES[0];
let poseTarget  = null;   // 補間目標
let poseFrom    = null;   // 補間元
let poseT       = 1.0;    // 0→1 の補間進行度（1=完了）
const POSE_LERP_SPEED = 3.5; // 大きいほど速い

function lerp(a, b, t) { return a + (b - a) * t; }

// ポーズを補間適用する（animateから毎フレーム呼ぶ）
function tickPoseLerp(dt) {
    if (poseT >= 1.0 || !poseTarget || !poseFrom) return;
    poseT = Math.min(poseT + dt * POSE_LERP_SPEED, 1.0);
    const t = poseT < 1 ? poseT * poseT * (3 - 2 * poseT) : 1; // smoothstep

    const p = animatedParts;
    if (!p.arms.length) return;

    // 頭
    if (p.head) {
        p.head.rotation.x = lerp(poseFrom.head.rx, poseTarget.head.rx, t);
        p.head.rotation.y = lerp(poseFrom.head.ry, poseTarget.head.ry, t);
        p.head.rotation.z = lerp(poseFrom.head.rz, poseTarget.head.rz, t);
    }
    // 腕
    p.arms.forEach((arm, i) => {
        const f = poseFrom.arms[i], g = poseTarget.arms[i];
        arm.root.rotation.x = lerp(f.root.rx, g.root.rx, t);
        arm.root.rotation.y = lerp(f.root.ry ?? 0, g.root.ry ?? 0, t);
        arm.root.rotation.z = lerp(f.root.rz, g.root.rz, t);
        arm.joint.rotation.x = lerp(f.joint.rx, g.joint.rx, t);
        arm.joint.rotation.z = lerp(f.joint.rz ?? 0, g.joint.rz ?? 0, t);
    });
    // 脚
    p.legs.forEach((leg, i) => {
        const f = poseFrom.legs[i], g = poseTarget.legs[i];
        leg.root.rotation.x = lerp(f.root.rx, g.root.rx, t);
        leg.root.rotation.z = lerp(f.root.rz, g.root.rz, t);
        leg.joint.rotation.x = lerp(f.joint.rx, g.joint.rx, t);
    });
    // 剣（持っている場合のみ）：ポーズごとのチルトをベース回転に加算
    if (p.sword) {
        const tiltFrom = poseFrom.swordTiltX ?? 0;
        const tiltTo   = poseTarget.swordTiltX ?? 0;
        const tilt = lerp(tiltFrom, tiltTo, t);
        p.sword.rotation.x = SWORD_BASE_ROTATION.x + tilt;
    }
}

// 現在の rotation 値をスナップショット
function snapshotCurrentRotations() {
    const p = animatedParts;
    if (!p.arms.length) return null;
    return {
        head: {
            rx: p.head ? p.head.rotation.x : 0,
            ry: p.head ? p.head.rotation.y : 0,
            rz: p.head ? p.head.rotation.z : 0,
        },
        arms: p.arms.map(arm => ({
            root:  { rx: arm.root.rotation.x,  ry: arm.root.rotation.y,  rz: arm.root.rotation.z  },
            joint: { rx: arm.joint.rotation.x, rz: arm.joint.rotation.z },
        })),
        legs: p.legs.map(leg => ({
            root:  { rx: leg.root.rotation.x, rz: leg.root.rotation.z },
            joint: { rx: leg.joint.rotation.x },
        })),
        swordTiltX: p.sword ? (p.sword.rotation.x - SWORD_BASE_ROTATION.x) : 0,
    };
}

// ポーズを切り替える（補間開始）
window.applyPose = function(pose) {
    currentPose = pose;
    poseFrom   = snapshotCurrentRotations() || pose;
    poseTarget = pose;
    poseT      = 0;
    // ポーズ切替時はアイドルを一時停止
    // (idleEnabledがtrueでもポーズ適用中は上書き)
};

// ポーズボタンを動的生成
function buildPoseButtons() {
    const poseContainer = document.getElementById('pose-buttons');
    const cmdContainer  = document.getElementById('command-buttons');
    if (!poseContainer || !cmdContainer) return;

    // ── ポーズボタン ──
    POSES.forEach((pose) => {
        const btn = document.createElement('button');
        btn.className = 'pose-btn';
        btn.textContent = pose.label;
        btn.addEventListener('click', () => {
            document.querySelectorAll('.pose-btn, .cmd-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            seqFrames = null; // シーケンス停止
            idleEnabled = false;
            document.getElementById('idleOnBtn').classList.remove('active');
            document.getElementById('idleOffBtn').classList.add('active');
            applyPose(pose);
        });
        poseContainer.appendChild(btn);
    });

    // ── コマンドボタン ──
    COMMANDS.forEach((cmd) => {
        const btn = document.createElement('button');
        btn.className = 'cmd-btn';
        btn.textContent = cmd.label;
        btn.addEventListener('click', () => {
            document.querySelectorAll('.pose-btn, .cmd-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            startSequence(cmd.frames);
            // 再生終了後にactiveを外す
            const waitMs = cmd.frames.reduce((s, f) => s + f.duration, 0) * 1000 + 200;
            setTimeout(() => btn.classList.remove('active'), waitMs);
        });
        cmdContainer.appendChild(btn);
    });

    // 最初のポーズボタンをactive
    poseContainer.firstChild && poseContainer.firstChild.classList.add('active');
}
buildPoseButtons();

// ポーズパネル開閉
const posePanelHeader = document.getElementById('pose-panel-header');
const posePanelBody   = document.getElementById('pose-panel-body');
const poseToggleIcon  = document.getElementById('pose-toggle-icon');
posePanelHeader.addEventListener('click', () => {
    const closed = posePanelBody.style.display === 'none';
    posePanelBody.style.display = closed ? 'block' : 'none';
    poseToggleIcon.textContent  = closed ? '▲' : '▼';
});

const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();
    
    const dt = clock.getDelta ? 0.016 : 0.016; // getDeltaは上で使用済みのため固定値

    // 頭のふわふわは常時
    if (animatedParts.head) {
        animatedParts.head.position.y = (2.87 + 0.70 * characterData.headScaleY) + Math.sin(time * 2) * 0.03;
    }

    if (idleEnabled) {
        // ── アイドルアニメ（完全優先） ──
        if (animatedParts.chest && animatedParts.belly) {
            animatedParts.chest.rotation.x = Math.sin(time * 2) * 0.05;
            animatedParts.belly.rotation.x = Math.sin(time * 2) * 0.02;
        }
        animatedParts.arms.forEach((arm, index) => {
            const sign = index === 0 ? 1 : -1;
            arm.root.rotation.x = Math.sin(time * 1.5) * 0.2 * sign;
            arm.root.rotation.y = 0;
            arm.root.rotation.z = 0.1 * sign;
            arm.joint.rotation.x = -0.1 + Math.sin(time * 1.5 + 1.0) * 0.1;
            arm.joint.rotation.z = 0;
        });
        animatedParts.legs.forEach((leg) => {
            leg.root.rotation.x = -0.05 + Math.sin(time * 2) * 0.02;
            leg.root.rotation.z = 0;
            leg.joint.rotation.x = 0.1 - Math.sin(time * 2) * 0.04;
        });
    } else {
        // ── シーケンス進行 & ポーズ補間 ──
        tickSequence(0.016);
        tickPoseLerp(0.016);
    }
    controls.update(); 
    renderer.render(scene, camera);
}
animate();

// ============================================================
// ポーズ → glTFアニメーションクリップ変換
// ============================================================
// オイラー角(rx, ry, rz)をglTFが扱える四元数配列[x,y,z,w]に変換
function eulerToQuatArray(rx = 0, ry = 0, rz = 0) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ'));
    return [q.x, q.y, q.z, q.w];
}

// ポーズで動かす9部品（頭 / 左右の肩・肘 / 左右の股関節・膝）と
// POSESデータ内の対応する回転値を取得する
function getAnimatedJoints() {
    const p = animatedParts;
    return [
        { obj: p.head,          get: pose => pose.head },
        { obj: p.arms[0].root,  get: pose => pose.arms[0].root },
        { obj: p.arms[0].joint, get: pose => pose.arms[0].joint },
        { obj: p.arms[1].root,  get: pose => pose.arms[1].root },
        { obj: p.arms[1].joint, get: pose => pose.arms[1].joint },
        { obj: p.legs[0].root,  get: pose => pose.legs[0].root },
        { obj: p.legs[0].joint, get: pose => pose.legs[0].joint },
        { obj: p.legs[1].root,  get: pose => pose.legs[1].root },
        { obj: p.legs[1].joint, get: pose => pose.legs[1].joint },
    ];
}

// 1つのポーズを「保持」するクリップに変換（開始・終了とも同じ姿勢）
function buildPoseClip(pose, name, duration = 1.0) {
    const tracks = getAnimatedJoints().map(({ obj, get }) => {
        const r = get(pose) || {};
        const q = eulerToQuatArray(r.rx || 0, r.ry || 0, r.rz || 0);
        return new THREE.QuaternionKeyframeTrack(
            `${obj.uuid}.quaternion`,
            [0, duration],
            [...q, ...q]
        );
    });
    // 剣を持っている場合は、ベース回転＋ポーズごとのチルトをクリップに反映する
    if (animatedParts.sword) {
        const tilt = pose.swordTiltX ?? 0;
        const q = eulerToQuatArray(
            SWORD_BASE_ROTATION.x + tilt,
            SWORD_BASE_ROTATION.y,
            SWORD_BASE_ROTATION.z
        );
        tracks.push(new THREE.QuaternionKeyframeTrack(
            `${animatedParts.sword.uuid}.quaternion`,
            [0, duration],
            [...q, ...q]
        ));
    }
    return new THREE.AnimationClip(name, duration, tracks);
}

// POSES全種をクリップ化（GLBに埋め込み、Blender等のアニメ一覧から
// 「Tポーズ」「万歳」などを選んで姿勢を切り替えられるようにする）
function buildPoseClips() {
    return POSES.map(pose => {
        // ラベルの絵文字部分を除いた名前をクリップ名にする（例:「🧍 Tポーズ」→「Tポーズ」）
        const clipName = pose.label.split(' ').slice(1).join(' ') || pose.label;
        return buildPoseClip(pose, clipName, 1.0);
    });
}

// 5. ダウンロード
document.getElementById('downloadBtn').addEventListener('click', () => {
    const exporter = new THREE.GLTFExporter();
    const animations = buildPoseClips();
    exporter.parse(characterGroup, function (result) {
        const blob = new Blob([result], { type: 'application/octet-stream' });
        const link = document.createElement('a');
        link.style.display = 'none';
        link.href = URL.createObjectURL(blob);
        link.download = 'my_character.glb';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    }, { binary: true, animations: animations });
});
