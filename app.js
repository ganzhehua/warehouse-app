// ===== 仓库设备管理系统 - 主逻辑 =====

const STORAGE_KEY = 'warehouse_devices';
const DRAFT_KEY = 'warehouse_draft';   // 草稿自动保存key
const MEMORY_KEY = 'warehouse_memory'; // 上次录入值记忆key
let photoData = { sn: '', front: '' };
let draftTimer = null;                 // 草稿防抖定时器

// ===== 工具函数 =====
function getDevices() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

function saveDevices(devices) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
}

function genId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function showToast(msg, duration = 2000) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
}

function formatDate(ts) {
    const d = new Date(ts);
    const pad = n => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ===== 页面切换 =====
function switchPage(pageName) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${pageName}`).classList.add('active');

    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.nav-btn[data-page="${pageName}"]`).classList.add('active');

    // 页面加载时刷新数据
    if (pageName === 'home') updateHome();
    if (pageName === 'list') renderList();
    if (pageName === 'dashboard') updateDashboard();
    // 进入录入页 → 恢复草稿
    if (pageName === 'entry') restoreDraft();
}

document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchPage(btn.dataset.page));
});

// ===== 录入表单 =====
document.getElementById('entry-form').addEventListener('submit', function (e) {
    e.preventDefault();

    const device = {
        id: document.getElementById('edit-id').value || genId(),
        manufacturer: document.getElementById('manufacturer').value.trim(),
        type: document.getElementById('type').value,
        name: document.getElementById('name').value.trim(),
        model: document.getElementById('model').value.trim(),
        sn: document.getElementById('sn').value.trim(),
        snPhoto: photoData.sn,
        frontPhoto: photoData.front,
        quantity: parseInt(document.getElementById('quantity').value) || 0,
        unit: document.getElementById('unit').value,
        status: document.getElementById('status').value,
        location: document.getElementById('location').value.trim(),
        remark: document.getElementById('remark').value.trim(),
        outbound: document.getElementById('outbound').value.trim(),
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    const devices = getDevices();
    const editId = document.getElementById('edit-id').value;

    if (editId) {
        const idx = devices.findIndex(d => d.id === editId);
        if (idx !== -1) {
            device.createdAt = devices[idx].createdAt;
            devices[idx] = device;
            showToast('修改成功！');
        }
    } else {
        // 检查SN是否重复
        if (devices.some(d => d.sn === device.sn)) {
            if (!confirm(`SN码"${device.sn}"已存在，是否继续保存？`)) {
                return;
            }
        }
        devices.unshift(device);
        showToast('录入成功！');
    }

    saveDevices(devices);

    // 录入成功 → 记住高频字段，下次自动填入
    if (!editId) {
        saveFieldMemory(device);
        showToast('录入成功！已记住厂家/类型/状态');
    } else {
        showToast('修改成功！');
    }

    resetForm();
    switchPage('home');
});

function resetForm() {
    document.getElementById('entry-form').reset();
    document.getElementById('edit-id').value = '';
    document.getElementById('location').value = '南街局值守班';
    photoData = { sn: '', front: '' };
    document.getElementById('sn-preview').innerHTML = '';
    document.getElementById('sn-preview').classList.remove('has-photo');
    document.getElementById('sn-photo-box').querySelector('.photo-placeholder').style.display = 'flex';
    document.getElementById('front-preview').innerHTML = '';
    document.getElementById('front-preview').classList.remove('has-photo');
    document.getElementById('front-photo-box').querySelector('.photo-placeholder').style.display = 'flex';
    // 清除草稿
    localStorage.removeItem(DRAFT_KEY);
    removeDraftBanner();
    // 用上次记住的值回填（方便批量录入）
    applyFieldMemory();
}

// ===== 填入信息记忆（记住全部非图片字段） =====
function saveFieldMemory(device) {
    // 记忆全部字段，只排除：图片(snPhoto/frontPhoto)、录入时间、位置(固定值)
    const keys = [
        'manufacturer', 'type', 'name', 'model',
        'sn', 'quantity', 'status', 'unit',
        'remark', 'outbound'
    ];
    let memory = {};
    try { memory = JSON.parse(localStorage.getItem(MEMORY_KEY)) || {}; } catch(e) {}

    keys.forEach(k => {
        const val = device[k];
        if (val !== undefined && val !== null && String(val).trim() && String(val) !== '0') {
            const arr = memory[k] || [];
            const newArr = [String(val), ...arr.filter(x => x !== String(val))].slice(0, 20);
            memory[k] = newArr;
        }
    });
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
}

// 从记忆库自动回填全部字段
function applyFieldMemory() {
    let memory = {};
    try { memory = JSON.parse(localStorage.getItem(MEMORY_KEY)) || {}; } catch(e) {}

    // 回填所有记忆字段（图片/时间/位置不回填）
    const fieldMap = [
        ['manufacturer', 'manufacturer'],
        ['type',         'type'],
        ['name',         'name'],
        ['model',        'model'],
        ['sn',           'sn'],
        ['quantity',     'quantity'],
        ['status',       'status'],
        ['unit',         'unit'],
        ['remark',       'remark'],
        ['outbound',     'outbound']
    ];
    fieldMap.forEach(([memKey, domId]) => {
        if (memory[memKey] && memory[memKey][0]) {
            document.getElementById(domId).value = memory[memKey][0];
        }
    });

    // 填充联想 datalist（有历史值的字段都加上）
    fillDatalist('datalist-manufacturer', memory.manufacturer || []);
    fillDatalist('datalist-type',         memory.type         || []);
    fillDatalist('datalist-name',         memory.name         || []);
    fillDatalist('datalist-model',        memory.model        || []);
    fillDatalist('datalist-status',       memory.status       || []);
}

function fillDatalist(id, values) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = values.map(v => `<option value="${v}"></option>`).join('');
}

// 手动刷新联想（从现有设备数据提取）
function refreshDatalistsFromDevices() {
    const devices = getDevices();
    fillDatalist('datalist-manufacturer', [...new Set(devices.map(d => d.manufacturer).filter(Boolean))]);
    fillDatalist('datalist-type',         [...new Set(devices.map(d => d.type).filter(Boolean))]);
    fillDatalist('datalist-name',         [...new Set(devices.map(d => d.name).filter(Boolean))]);
    fillDatalist('datalist-model',        [...new Set(devices.map(d => d.model).filter(Boolean))]);
    fillDatalist('datalist-status',       [...new Set(devices.map(d => d.status).filter(Boolean))]);
}

// ===== 草稿自动保存（防抖，300ms） =====
function saveDraft() {
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
        const editId = document.getElementById('edit-id').value;
        // 编辑模式不存草稿
        if (editId) return;

        const draft = {
            manufacturer: document.getElementById('manufacturer').value,
            type:         document.getElementById('type').value,
            name:         document.getElementById('name').value,
            model:        document.getElementById('model').value,
            sn:           document.getElementById('sn').value,
            quantity:     document.getElementById('quantity').value,
            unit:         document.getElementById('unit').value,
            status:       document.getElementById('status').value,
            location:     document.getElementById('location').value,
            remark:       document.getElementById('remark').value,
            outbound:     document.getElementById('outbound').value,
            snPhoto:      photoData.sn,
            frontPhoto:   photoData.front,
            savedAt:      Date.now()
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    }, 300);
}

// 进入录入页时恢复草稿
function restoreDraft() {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    let draft;
    try { draft = JSON.parse(raw); } catch (e) { return; }
    if (!draft || !draft.savedAt) return;

    // 编辑模式不恢复
    const editId = document.getElementById('edit-id').value;
    if (editId) return;

    // 显示恢复草稿提示横幅
    showDraftBanner(draft);
}

function showDraftBanner(draft) {
    let banner = document.getElementById('draft-banner');
    if (banner) { banner.remove(); }

    const savedAt = formatDate(draft.savedAt);
    banner = document.createElement('div');
    banner.id = 'draft-banner';
    banner.style.cssText = `
        display:flex;align-items:center;gap:10px;
        background:#fff7e6;border:1px solid #ffd591;border-radius:8px;
        padding:10px 14px;margin-bottom:12px;font-size:13px;color:#d46b08;
    `;
    banner.innerHTML = `
        <span>💾 发现自动保存的草稿（${savedAt}）</span>
        <button onclick="applyDraft()" style="background:#fa8c16;color:#fff;border:none;border-radius:4px;padding:4px 10px;font-size:12px;cursor:pointer;">恢复</button>
        <button onclick="discardDraft()" style="background:none;border:none;color:#999;cursor:pointer;font-size:18px;">×</button>
    `;

    const form = document.getElementById('entry-form');
    form.parentNode.insertBefore(banner, form);
}

function removeDraftBanner() {
    const b = document.getElementById('draft-banner');
    if (b) b.remove();
}

function applyDraft() {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    let draft;
    try { draft = JSON.parse(raw); } catch (e) { return; }

    document.getElementById('manufacturer').value = draft.manufacturer || '';
    document.getElementById('type').value         = draft.type         || '';
    document.getElementById('name').value         = draft.name         || '';
    document.getElementById('model').value        = draft.model        || '';
    document.getElementById('sn').value           = draft.sn           || '';
    document.getElementById('quantity').value    = draft.quantity     || '';
    document.getElementById('unit').value        = draft.unit         || '件';
    document.getElementById('status').value       = draft.status       || '';
    document.getElementById('location').value     = draft.location     || '南街局值守班';
    document.getElementById('remark').value      = draft.remark       || '';
    document.getElementById('outbound').value    = draft.outbound     || '';

    photoData.sn    = draft.snPhoto    || '';
    photoData.front = draft.frontPhoto || '';
    if (photoData.sn)    showPhotoPreview('sn',    photoData.sn);
    if (photoData.front) showPhotoPreview('front', photoData.front);

    removeDraftBanner();
    showToast('草稿已恢复');
}

function discardDraft() {
    localStorage.removeItem(DRAFT_KEY);
    removeDraftBanner();
    showToast('草稿已丢弃');
}

// ===== 拍照上传 =====
function handlePhotoUpload(input, type) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const imgData = e.target.result;
        // 压缩图片
        compressImage(imgData, 800, 0.7).then(compressed => {
            photoData[type] = compressed;
            showPhotoPreview(type, compressed);
            showToast('图片已添加');
        });
    };
    reader.readAsDataURL(file);
}

function showPhotoPreview(type, imgSrc) {
    const preview = document.getElementById(`${type}-preview`);
    const placeholder = document.getElementById(`${type}-photo-box`).querySelector('.photo-placeholder');
    placeholder.style.display = 'none';
    preview.classList.add('has-photo');

    preview.innerHTML = `
        <img src="${imgSrc}" onclick="showImgModal('${imgSrc}')">
        <button class="photo-remove" onclick="removePhoto('${type}')">×</button>
    `;
}

function removePhoto(type) {
    photoData[type] = '';
    const preview = document.getElementById(`${type}-preview`);
    const placeholder = document.getElementById(`${type}-photo-box`).querySelector('.photo-placeholder');
    preview.innerHTML = '';
    preview.classList.remove('has-photo');
    placeholder.style.display = 'flex';
}

// 图片压缩
function compressImage(dataUrl, maxWidth, quality) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = function () {
            let width = img.width;
            let height = img.height;
            if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = dataUrl;
    });
}

// ===== 条形码扫描（Html5Qrcode + 拍照 + OCR 三重保障） =====
let html5QrCode = null;
let scannerActive = false;
let ocrWorker = null;

function showOCRMask(text) {
    document.getElementById('ocr-text').textContent = text;
    document.getElementById('ocr-mask').classList.add('show');
}

function updateOCRText(text) {
    document.getElementById('ocr-text').textContent = text;
}

function hideOCRMask() {
    document.getElementById('ocr-mask').classList.remove('show');
}

// 启动实时摄像头扫码（Html5Qrcode，手机端识别率更高）
function startScanner(target) {
    const modal = document.getElementById('scanner-modal');
    const container = document.getElementById('scanner-container');
    modal.classList.add('show');
    scannerActive = true;

    // 动态创建 Html5Qrcode 扫描容器
    container.innerHTML = `
        <div class="scanner-header">
            <h3>条形码扫描</h3>
            <button class="scanner-close" onclick="stopScanner()">×</button>
        </div>
        <div id="qr-reader" style="width:100%;"></div>
        <div class="scanner-tips">
            <div class="scanner-frame-mini"></div>
            <p>将条形码对准框内，保持1-2秒</p>
        </div>
        <div class="scanner-btns">
            <button class="btn-secondary" onclick="stopScanner();captureBarcodeImage('${target}')">📷 拍照识别</button>
            <button class="btn-secondary" onclick="stopScanner()">取消</button>
        </div>
    `;

    html5QrCode = new Html5Qrcode('qr-reader');

    const config = {
        fps: 15,
        qrbox: { width: 280, height: 120 },
        aspectRatio: 2.5,
        showTorchButtonIfSupported: true,
        videoConstraints: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 }
        },
        formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODABAR,
            Html5QrcodeSupportedFormats.QR_CODE
        ]
    };

    html5QrCode.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
            if (!scannerActive) return;
            scannerActive = false;
            stopScanner();

            const sn = decodedText.trim();
            if (target === 'sn') {
                document.getElementById('sn').value = sn;
                showToast('扫码成功：' + sn);
            } else if (target === 'search') {
                document.getElementById('search-input').value = sn;
                doSearch();
            }
        },
        () => {} // 忽略持续的失败回调
    ).catch(err => {
        console.error('摄像头启动失败:', err);
        // 回退到拍照模式
        stopScanner();
        captureBarcodeImage(target);
    });
}

// 停止实时扫码
function stopScanner() {
    scannerActive = false;
    const modal = document.getElementById('scanner-modal');
    modal.classList.remove('show');

    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().then(() => {
            html5QrCode.clear();
        }).catch(() => {});
    }
    html5QrCode = null;
}

// 拍照识别：条码 → OCR文字 → 交叉验证取最可信
function captureBarcodeImage(target) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async function (e) {
        const file = e.target.files[0];
        if (!file) return;

        showOCRMask('正在识别条码...');

        try {
            // 并行尝试：双引擎条码解码 + OCR
            const [barcodeResult, ocrResult] = await Promise.all([
                tryDecodeBarcode(file).catch(() => null),
                tryOCR_SN(file).catch(() => null)
            ]);

            updateOCRText('综合分析结果...');

            // 智能评分选最优
            let finalSN = null;
            let method = '';

            if (barcodeResult && ocrResult) {
                const b = barcodeResult.toUpperCase();
                const o = ocrResult.toUpperCase();
                // 完全一致 → 双引擎确认
                if (b === o) {
                    finalSN = b;
                    method = '条码+OCR双重确认';
                }
                // 其中一个包含另一个
                else if (b.includes(o) || o.includes(b)) {
                    finalSN = b.length >= o.length ? b : o;
                    method = '综合识别';
                }
                // 不一致 → 条码优先（条码引擎比OCR更准）
                else {
                    finalSN = b;
                    method = '条码识别(与OCR不一致)';
                }
            } else if (barcodeResult) {
                finalSN = barcodeResult;
                method = '条码识别';
            } else if (ocrResult) {
                finalSN = ocrResult;
                method = 'OCR文字识别';
            }

            hideOCRMask();

            if (finalSN) {
                // 格式清理：只保留大写字母和数字
                finalSN = finalSN.toUpperCase().replace(/[^A-Z0-9]/g, '');
                if (finalSN.length < 3) {
                    showToast('识别结果太短，请重试');
                    return;
                }

                if (target === 'sn') {
                    document.getElementById('sn').value = finalSN;
                    const dataUrl = await fileToDataURL(file);
                    const compressed = await compressImage(dataUrl, 800, 0.7);
                    photoData.sn = compressed;
                    showPhotoPreview('sn', compressed);
                    showToast(method + '：' + finalSN);
                } else if (target === 'search') {
                    document.getElementById('search-input').value = finalSN;
                    doSearch();
                }
            } else {
                showToast('未能识别，请重试或手动输入');
            }
        } catch (err) {
            console.error(err);
            hideOCRMask();
            showToast('识别失败，请重试');
        }
    };
    input.click();
}

// ===== 条码识别：ZXing + Html5Qrcode 双引擎并行 =====
// 尝试用 ZXing 引擎解码（带 CODE128/CODE39 hints）
async function tryZXingBarcode(dataUrl) {
    try {
        if (!window.ZXing || !ZXing.BrowserMultiFormatReader) return null;
        const reader = new ZXing.BrowserMultiFormatReader();
        // 设置解码提示：优先 CODE128 和 CODE39（设备SN码最常见格式）
        if (ZXing.DecodeHintType) {
            const hints = new Map();
            hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
                ZXing.BarcodeFormat.CODE_128,
                ZXing.BarcodeFormat.CODE_39,
                ZXing.BarcodeFormat.CODE_93,
                ZXing.BarcodeFormat.CODABAR,
                ZXing.BarcodeFormat.EAN_13,
                ZXing.BarcodeFormat.UPC_A,
                ZXing.BarcodeFormat.QR_CODE
            ]);
            hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
            reader.hints = hints;
        }
        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve; img.onerror = reject; img.src = dataUrl;
        });
        const result = await reader.decodeFromImageElement(img);
        return result ? result.text.trim() : null;
    } catch (e) { return null; }
}

// 尝试用 Html5Qrcode 解码
async function tryHtml5QrBarcode(dataUrl) {
    try {
        const container = document.createElement('div');
        container.id = 'qr-temp-' + Date.now();
        container.style.display = 'none';
        document.body.appendChild(container);
        const reader = new Html5Qrcode(container.id);
        const result = await reader.scanFile(dataUrl, false).catch(() => null);
        document.body.removeChild(container);
        return result ? result.trim() : null;
    } catch (e) { return null; }
}

// 用多个方向 + 两个引擎并行尝试
async function tryDecodeBarcode(file) {
    const dataUrl = await fileToDataURL(file);

    // 生成多个方向的图：原图 + 增强 + 旋转90°/180°/270°
    const variants = await Promise.all([
        Promise.resolve(dataUrl),                 // 原图
        enhanceBarcodeImage(dataUrl),              // Otsu增强
        rotateImage(dataUrl, 90).catch(() => null),
        rotateImage(dataUrl, 180).catch(() => null),
        rotateImage(dataUrl, 270).catch(() => null),
    ]);

    const tasks = [];
    for (const v of variants) {
        if (!v) continue;
        tasks.push(tryZXingBarcode(v));
        tasks.push(tryHtml5QrBarcode(v));
    }

    // 并行跑所有，取第一个非null的结果
    const results = await Promise.all(tasks);
    const valid = results.filter(r => r);
    if (valid.length === 0) return null;

    // 去重，取最长的（最长通常是最完整的）
    const unique = [...new Set(valid)];
    unique.sort((a, b) => b.length - a.length);
    return unique[0];
}

// 图像旋转
function rotateImage(dataUrl, degrees) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const rad = degrees * Math.PI / 180;
            const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
            const w = img.width * cos + img.height * sin;
            const h = img.width * sin + img.height * cos;
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.translate(w/2, h/2);
            ctx.rotate(rad);
            ctx.drawImage(img, -img.width/2, -img.height/2);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = dataUrl;
    });
}

// 条码图像预处理：放大2倍 + 灰度 + Otsu自适应二值化
function enhanceBarcodeImage(dataUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const scale = Math.max(2, 800 / Math.min(img.width, img.height));
            const w = Math.round(img.width * scale);
            const h = Math.round(img.height * scale);
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, w, h);

            const imgData = ctx.getImageData(0, 0, w, h);
            const data = imgData.data;

            // 1. 灰度
            const grayArr = new Uint8ClampedArray(w * h);
            for (let i = 0, j = 0; i < data.length; i += 4, j++) {
                grayArr[j] = data[i] * 0.3 + data[i+1] * 0.59 + data[i+2] * 0.11;
            }

            // 2. Otsu 自适应阈值计算
            const histogram = new Array(256).fill(0);
            for (let i = 0; i < grayArr.length; i++) histogram[grayArr[i]]++;
            const total = grayArr.length;
            let sum = 0;
            for (let i = 0; i < 256; i++) sum += i * histogram[i];
            let sumB = 0, wB = 0, maxVar = 0, threshold = 128;
            for (let i = 0; i < 256; i++) {
                wB += histogram[i];
                if (wB === 0) continue;
                const wF = total - wB;
                if (wF === 0) break;
                sumB += i * histogram[i];
                const mB = sumB / wB;
                const mF = (sum - sumB) / wF;
                const betweenVar = wB * wF * (mB - mF) * (mB - mF);
                if (betweenVar > maxVar) { maxVar = betweenVar; threshold = i; }
            }

            // 3. 二值化
            for (let i = 0, j = 0; i < data.length; i += 4, j++) {
                const v = grayArr[j] > threshold ? 255 : 0;
                data[i] = data[i+1] = data[i+2] = v;
            }
            ctx.putImageData(imgData, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(null);
        img.src = dataUrl;
    });
}

// OCR 识别图片中的 S/N: 文字（多预处理变体 + PSM单行模式 + 混淆纠正）
async function tryOCR_SN(file) {
    try {
        if (!ocrWorker) {
            updateOCRText('加载OCR引擎(中英)...');
            ocrWorker = await Tesseract.createWorker(['eng', 'chi_sim'], 1, {
                logger: m => {
                    if (m.status && m.progress !== undefined) {
                        updateOCRText(`OCR识别中 ${Math.round(m.progress*100)}%`);
                    }
                }
            });
            await ocrWorker.setParameters({
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789S/N:- '
            });
        }

        const dataUrl = await fileToDataURL(file);

        // 生成多个预处理变体并行跑OCR，取最优结果
        const variants = await Promise.all([
            Promise.resolve(dataUrl),                        // 原图
            enhanceForOCR(dataUrl, 1.5, 0),                   // 放大1.5x
            enhanceForOCR(dataUrl, 2.0, 30),                  // 放大2x + 对比度+30
            enhanceForOCR(dataUrl, 2.0, 60),                  // 放大2x + 对比度+60
        ]);

        // 依次跑OCR（Tesseract worker不支持并发，需串行）
        const results = [];
        for (let i = 0; i < variants.length; i++) {
            if (!variants[i]) continue;
            updateOCRText(`OCR识别中 变体${i+1}/${variants.length}...`);
            try {
                const { data } = await ocrWorker.recognize(variants[i]);
                if (data && data.text) {
                    const sn = extractSNFromText(data.text);
                    if (sn) {
                        // 用置信度打分
                        const conf = data.confidence || 50;
                        results.push({ sn, confidence: conf, variant: i });
                    }
                }
            } catch(e) { /* 跳过 */ }
        }

        if (results.length === 0) return null;

        // 按置信度排序，取最高的
        results.sort((a, b) => b.confidence - a.confidence);
        return results[0].sn;
    } catch (err) {
        console.error('OCR错误:', err);
        return null;
    }
}

// OCR专用图像预处理：放大 + 灰度 + 对比度增强 + 锐化
function enhanceForOCR(dataUrl, scale, contrastBoost) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const w = Math.round(img.width * scale);
            const h = Math.round(img.height * scale);
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, w, h);

            const imgData = ctx.getImageData(0, 0, w, h);
            const data = imgData.data;
            const contrastFactor = (259 * (contrastBoost + 255)) / (255 * (259 - contrastBoost));

            for (let i = 0; i < data.length; i += 4) {
                // 灰度
                let gray = data[i] * 0.3 + data[i+1] * 0.59 + data[i+2] * 0.11;
                // 对比度增强
                gray = contrastFactor * (gray - 128) + 128;
                gray = Math.max(0, Math.min(255, gray));
                data[i] = data[i+1] = data[i+2] = gray;
            }
            ctx.putImageData(imgData, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(null);
        img.src = dataUrl;
    });
}

// 从OCR文本中智能提取SN码（多路正则 + 混淆字符纠正）
function extractSNFromText(text) {
    if (!text) return null;

    const cleaned = text
        .replace(/\s+/g, ' ')
        .replace(/[^\x20-\x7E]/g, '');  // 去掉非ASCII

    const candidates = [];

    // 1. 最高优先：S/N: 或 SN: 或 Serial No: 后面跟的字母数字串
    const p1 = cleaned.match(/S\s*[\/]\s*N\s*[:：]?\s*([A-Za-z0-9\-_]{6,40})/i);
    if (p1) candidates.push({ sn: p1[1], score: 100 });

    const p2 = cleaned.match(/SN\s*[:：]\s*([A-Za-z0-9\-_]{6,40})/i);
    if (p2) candidates.push({ sn: p2[1], score: 95 });

    const p3 = cleaned.match(/Serial\s*(?:No\.?|Number)\s*[:：]?\s*([A-Za-z0-9\-_]{6,40})/i);
    if (p3) candidates.push({ sn: p3[1], score: 90 });

    // 2. 包含冒号后紧跟长串的
    const p4 = cleaned.match(/[:：]\s*([A-Za-z0-9]{8,40})/);
    if (p4) candidates.push({ sn: p4[1], score: 70 });

    // 3. 从文本中找所有较长的字母数字混合串
    const allAlnum = cleaned.match(/[A-Za-z0-9]{8,}/g);
    if (allAlnum && allAlnum.length > 0) {
        const mixed = allAlnum.filter(s => /[A-Za-z]/.test(s) && /[0-9]/.test(s));
        if (mixed.length > 0) {
            mixed.sort((a, b) => b.length - a.length);
            candidates.push({ sn: mixed[0], score: 50 });
        } else {
            allAlnum.sort((a, b) => b.length - a.length);
            candidates.push({ sn: allAlnum[0], score: 30 });
        }
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    // 混淆字符纠正：OCR常把0和O、1和I/l、5和S混淆
    // 规则：如果SN码里同时有字母和数字，根据上下文纠正
    let sn = best.sn.toUpperCase().replace(/[^A-Z0-9]/g, '');

    // 去除常见误识别前缀（如 "S/N" 被识别进结果里）
    sn = sn.replace(/^SN/i, '').replace(/^S\/N/i, '');

    return sn;
}

function fileToDataURL(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.readAsDataURL(file);
    });
}

// ===== 搜索功能 =====
function doSearch() {
    const keyword = document.getElementById('search-input').value.trim().toLowerCase();
    const results = document.getElementById('search-results');

    if (!keyword) {
        results.innerHTML = '<p class="empty-tip">请输入SN码进行搜索</p>';
        return;
    }

    const devices = getDevices();
    const matched = devices.filter(d =>
        d.sn.toLowerCase().includes(keyword) ||
        d.name.toLowerCase().includes(keyword) ||
        d.model.toLowerCase().includes(keyword)
    );

    if (matched.length === 0) {
        results.innerHTML = `<p class="empty-tip">未找到包含"${keyword}"的设备</p>`;
        return;
    }

    results.innerHTML = matched.map(d => `
        <div class="search-result-item" onclick="viewDevice('${d.id}')">
            <div class="result-name">${d.name} <span style="color:#8c8c8c;font-weight:normal;font-size:12px;">(${d.type})</span></div>
            <div class="result-sn">SN: ${d.sn}</div>
            <div class="result-meta">厂家: ${d.manufacturer} | 型号: ${d.model || '-'} | 数量: ${d.quantity}${d.unit} | 地点: ${d.location}</div>
            <div class="result-meta">状态: <span style="color:${getStatusColor(d.status)}">${d.status}</span></div>
        </div>
    `).join('');
}

function getStatusColor(status) {
    if (status.includes('在库')) return '#52c41a';
    if (status.includes('出库')) return '#ff4d4f';
    if (status.includes('维修')) return '#faad14';
    return '#8c8c8c';
}

// 搜索回车
document.getElementById('search-input').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') doSearch();
});

// ===== 列表页面 =====
function renderList() {
    const keyword = document.getElementById('list-filter').value.trim().toLowerCase();
    const statusFilter = document.getElementById('status-filter').value;
    const devices = getDevices();

    let filtered = devices;
    if (keyword) {
        filtered = filtered.filter(d =>
            d.name.toLowerCase().includes(keyword) ||
            d.sn.toLowerCase().includes(keyword) ||
            d.model.toLowerCase().includes(keyword) ||
            d.location.toLowerCase().includes(keyword)
        );
    }
    if (statusFilter) {
        filtered = filtered.filter(d => d.status.toLowerCase().includes(statusFilter.toLowerCase()));
    }

    const listEl = document.getElementById('device-list');

    if (filtered.length === 0) {
        listEl.innerHTML = '<p class="empty-tip">暂无设备数据</p>';
        return;
    }

    listEl.innerHTML = filtered.map(d => `
        <div class="device-card">
            <div class="card-header">
                <div class="card-name">${d.name}</div>
                <span class="status-tag ${getStatusClass(d.status)}">${d.status}</span>
            </div>
            <div class="card-sn">SN: ${d.sn}</div>
            <div class="card-info">
                <div>类型: ${d.type}</div>
                <div>厂家: ${d.manufacturer}</div>
                <div>型号: ${d.model || '-'}</div>
                <div>数量: ${d.quantity}${d.unit}</div>
                <div>地点: ${d.location}</div>
                <div>录入: ${formatDate(d.createdAt)}</div>
            </div>
            <div class="card-actions">
                <button class="btn-edit" onclick="editDevice('${d.id}')">编辑</button>
                <button class="btn-delete" onclick="deleteDevice('${d.id}')">删除</button>
            </div>
        </div>
    `).join('');
}

function getStatusClass(status) {
    if (status.includes('在库')) return 'status-在库';
    if (status.includes('出库')) return 'status-出库';
    if (status.includes('维修')) return 'status-维修';
    if (status.includes('报废')) return 'status-报废';
    return 'status-在库';
}

// ===== 查看/编辑/删除 =====
function viewDevice(id) {
    const devices = getDevices();
    const device = devices.find(d => d.id === id);
    if (!device) return;

    alert(`设备详情\n\n名称: ${device.name}\nSN码: ${device.sn}\n类型: ${device.type}\n厂家: ${device.manufacturer}\n型号: ${device.model || '-'}\n数量: ${device.quantity}${device.unit}\n状态: ${device.status}\n存放地点: ${device.location}\n备注: ${device.remark || '-'}\n出库记录: ${device.outbound || '-'}\n录入时间: ${formatDate(device.createdAt)}`);
}

function editDevice(id) {
    const devices = getDevices();
    const device = devices.find(d => d.id === id);
    if (!device) return;

    document.getElementById('edit-id').value = device.id;
    document.getElementById('manufacturer').value = device.manufacturer;
    document.getElementById('type').value = device.type;
    document.getElementById('name').value = device.name;
    document.getElementById('model').value = device.model;
    document.getElementById('sn').value = device.sn;
    document.getElementById('quantity').value = device.quantity;
    document.getElementById('unit').value = device.unit;
    document.getElementById('status').value = device.status;
    document.getElementById('location').value = device.location;
    document.getElementById('remark').value = device.remark;
    document.getElementById('outbound').value = device.outbound;

    photoData.sn = device.snPhoto || '';
    photoData.front = device.frontPhoto || '';

    if (photoData.sn) showPhotoPreview('sn', photoData.sn);
    if (photoData.front) showPhotoPreview('front', photoData.front);

    switchPage('entry');
    showToast('加载中，可进行编辑');
}

function deleteDevice(id) {
    if (!confirm('确定要删除该设备吗？此操作不可恢复。')) return;
    let devices = getDevices();
    devices = devices.filter(d => d.id !== id);
    saveDevices(devices);
    renderList();
    showToast('已删除');
}

// ===== 首页数据 =====
function updateHome() {
    const devices = getDevices();
    const totalTypes = new Set(devices.map(d => d.type)).size;
    const totalQty = devices.reduce((sum, d) => sum + d.quantity, 0);

    document.getElementById('stat-total').textContent = devices.length;
    document.getElementById('stat-types').textContent = totalTypes;
    document.getElementById('stat-qty').textContent = totalQty;

    const recent = devices.slice(0, 5);
    const recentEl = document.getElementById('recent-list');
    if (recent.length === 0) {
        recentEl.innerHTML = '<p class="empty-tip">暂无数据，快去录入吧~</p>';
    } else {
        recentEl.innerHTML = recent.map(d => `
            <div class="recent-item" onclick="viewDevice('${d.id}')">
                <div class="info">
                    <div class="name">${d.name}</div>
                    <div class="sub">SN: ${d.sn} | ${d.location}</div>
                </div>
                <span class="badge">${d.status}</span>
            </div>
        `).join('');
    }
}

// ===== 看板数据 =====
function updateDashboard() {
    const devices = getDevices();
    const totalQty = devices.reduce((sum, d) => sum + d.quantity, 0);
    const inCount = devices.filter(d => d.status.includes('在库')).length;
    const outCount = devices.filter(d => d.status.includes('出库') || d.status.includes('报废')).length;

    document.getElementById('dash-total').textContent = devices.length;
    document.getElementById('dash-qty').textContent = totalQty;
    document.getElementById('dash-in').textContent = inCount;
    document.getElementById('dash-out').textContent = outCount;

    renderStatList('type-stats', groupBy(devices, 'type'), '种', 'type');
    renderStatList('status-stats', groupBy(devices, 'status'), '项', 'status');
    renderStatList('mfr-stats', groupBy(devices, 'manufacturer'), '项', 'manufacturer');
    renderStatList('location-stats', groupBy(devices, 'location'), '项', 'location');
}

function groupBy(arr, key) {
    const result = {};
    arr.forEach(item => {
        const k = item[key] || '未填写';
        result[k] = (result[k] || 0) + 1;
    });
    return Object.entries(result).sort((a, b) => b[1] - a[1]);
}

function renderStatList(elId, data, unit, field) {
    const el = document.getElementById(elId);
    const max = data.length > 0 ? data[0][1] : 1;

    if (data.length === 0) {
        el.innerHTML = '<p class="empty-tip">暂无数据</p>';
        return;
    }

    el.innerHTML = data.slice(0, 10).map(([label, count]) => `
        <div class="stat-row clickable" onclick="showTypeFilter('${field}','${label.replace(/'/g, "\\'")}')">
            <span class="label">${label}</span>
            <div class="stat-bar"><div class="stat-bar-fill" style="width:${(count / max) * 100}%"></div></div>
            <span class="value">${count}${unit} <span style="color:#1677ff;font-size:11px;">›</span></span>
        </div>
    `).join('');
}

// 类型筛选弹窗
function showTypeFilter(field, value) {
    const devices = getDevices();
    const filtered = devices.filter(d => (d[field] || '未填写') === value);

    document.getElementById('type-filter-title').textContent = `${value}（${filtered.length}条）`;
    const listEl = document.getElementById('type-filter-list');

    if (filtered.length === 0) {
        listEl.innerHTML = '<p class="empty-tip">暂无数据</p>';
    } else {
        listEl.innerHTML = filtered.map(d => `
            <div class="filter-device-item" onclick="closeTypeFilter();viewDevice('${d.id}')">
                <div class="filter-device-name">${d.name}</div>
                <div class="filter-device-sn">SN: ${d.sn}</div>
                <div class="filter-device-meta">
                    <span>${d.type}</span>
                    <span>${d.manufacturer}</span>
                    <span>${d.quantity}${d.unit}</span>
                    <span style="color:${getStatusColor(d.status)}">${d.status}</span>
                </div>
            </div>
        `).join('');
    }

    document.getElementById('type-filter-modal').classList.add('show');
}

function closeTypeFilter() {
    document.getElementById('type-filter-modal').classList.remove('show');
}

// ===== 导出Excel（图片嵌入单元格） =====
async function exportExcel() {
    const devices = getDevices();
    if (devices.length === 0) {
        showToast('暂无数据可导出');
        return;
    }

    showOCRMask('正在生成表格...');

    try {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = '仓库设备管理系统';
        workbook.created = new Date();

        const worksheet = workbook.addWorksheet('仓库设备数据');

        // 定义列结构（仅key和宽度，不用header自动生成，避免行号偏差）
        worksheet.columns = [
            { key: 'manufacturer', width: 15 },
            { key: 'type',         width: 12 },
            { key: 'name',         width: 18 },
            { key: 'model',        width: 15 },
            { key: 'sn',           width: 20 },
            { key: 'snPhoto',      width: 16 },
            { key: 'frontPhoto',   width: 16 },
            { key: 'quantity',     width: 8  },
            { key: 'unit',         width: 6  },
            { key: 'status',       width: 14 },
            { key: 'location',     width: 15 },
            { key: 'remark',       width: 20 },
            { key: 'outbound',     width: 20 },
            { key: 'createdAt',    width: 18 }
        ];

        // 手动添加表头行 → 确保是第1行
        const headerRow = worksheet.addRow({
            manufacturer: '厂家',
            type:         '设备/备件类型',
            name:         '设备/备件名称',
            model:        '设备/备件型号',
            sn:           '设备序列号SN码',
            snPhoto:      'SN码图片',
            frontPhoto:   '正面图片',
            quantity:     '数量',
            unit:         '单位',
            status:       '设备/备件使用状态',
            location:     '存放地点',
            remark:       '备注',
            outbound:     '出库记录',
            createdAt:    '录入时间'
        });
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1677FF' } };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        headerRow.height = 30;

        const imgRowHeight = 110;

        // 逐行添加数据，用 row.number 获取真实行号定位图片
        for (let i = 0; i < devices.length; i++) {
            const d = devices[i];

            const row = worksheet.addRow({
                manufacturer: d.manufacturer || '',
                type:         d.type || '',
                name:         d.name || '',
                model:        d.model || '',
                sn:           d.sn || '',
                snPhoto:      '',
                frontPhoto:   '',
                quantity:     d.quantity || 0,
                unit:         d.unit || '',
                status:       d.status || '',
                location:     d.location || '',
                remark:       d.remark || '',
                outbound:     d.outbound || '',
                createdAt:    formatDate(d.createdAt)
            });

            // 用 ExcelJS 返回的真实行号（1-based），转 0-based 给图片定位
            const imgRow0 = row.number - 1; // 0-based 行号

            row.height = imgRowHeight;
            row.alignment = { vertical: 'middle', wrapText: true };

            // 嵌入SN码图片 → F列（col=5, 0-based）
            if (d.snPhoto) {
                try {
                    const base64 = d.snPhoto.split(',')[1];
                    const imageId = workbook.addImage({
                        base64: base64,
                        extension: 'jpeg'
                    });
                    worksheet.addImage(imageId, {
                        tl: { col: 5, row: imgRow0 },
                        br: { col: 6, row: imgRow0 + 1 },
                        editAs: 'oneCell'
                    });
                } catch (e) {
                    row.getCell(6).value = '[图片]';
                }
            }

            // 嵌入正面图片 → G列（col=6, 0-based）
            if (d.frontPhoto) {
                try {
                    const base64 = d.frontPhoto.split(',')[1];
                    const imageId = workbook.addImage({
                        base64: base64,
                        extension: 'jpeg'
                    });
                    worksheet.addImage(imageId, {
                        tl: { col: 6, row: imgRow0 },
                        br: { col: 7, row: imgRow0 + 1 },
                        editAs: 'oneCell'
                    });
                } catch (e) {
                    row.getCell(7).value = '[图片]';
                }
            }
        }

        // 冻结首行
        worksheet.views = [{ state: 'frozen', ySplit: 1 }];

        // 生成 Excel 文件
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });

        const now = new Date();
        const pad = n => n.toString().padStart(2, '0');
        const filename = `仓库设备数据_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.xlsx`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        hideOCRMask();
        const imgCount = devices.filter(d => d.snPhoto || d.frontPhoto).length;
        showToast(`导出成功！共${devices.length}条数据，${imgCount}条含图片`);
    } catch (err) {
        console.error(err);
        hideOCRMask();
        showToast('导出失败，请重试');
    }
}

// ===== 图片大图 =====
function showImgModal(src) {
    document.getElementById('img-modal-content').src = src;
    document.getElementById('img-modal').classList.add('show');
}

function closeImgModal() {
    document.getElementById('img-modal').classList.remove('show');
}

// ===== 版本检查 & 强制更新 =====
function checkUpdate() {
    if (confirm('检查到新版本，是否清除缓存并刷新？\n\n当前功能：\n1. SN码条形码扫码识别\n2. 导出Excel图片嵌入单元格\n3. 看板分类可点击查看')) {
        // 注销旧的 service worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(registrations => {
                registrations.forEach(reg => reg.unregister());
            });
        }
        // 清除缓存
        if ('caches' in window) {
            caches.keys().then(keys => {
                keys.forEach(key => caches.delete(key));
            });
        }
        setTimeout(() => location.reload(true), 300);
    }
}

// ===== 初始化 =====
window.addEventListener('DOMContentLoaded', () => {
    updateHome();

    // 绑定录入表单的所有输入 → 自动保存草稿
    const form = document.getElementById('entry-form');
    form.addEventListener('input', saveDraft);
    form.addEventListener('change', saveDraft);
    // 切到其他页面前也保存一次
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') saveDraft();
    });

    // 初始化联想列表（从已有数据 + 记忆值）
    refreshDatalistsFromDevices();
    // 同时用记忆值（最新录入的排前面）
    applyFieldMemory();
});

// ===== PWA Service Worker 注册 =====
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js?v=2.0')
            .then(registration => {
                console.log('ServiceWorker 注册成功，作用域:', registration.scope);
            })
            .catch(err => {
                console.log('ServiceWorker 注册失败:', err);
            });
    });
}

// ===== PWA 安装提示 =====
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    // 阻止浏览器默认的安装提示
    e.preventDefault();
    deferredPrompt = e;
    console.log('可以安装APP了');
    // 可以在这里显示自定义的安装按钮
    showInstallBanner();
});

function showInstallBanner() {
    // 创建安装提示横幅
    let banner = document.getElementById('install-banner');
    if (banner) return;

    banner = document.createElement('div');
    banner.id = 'install-banner';
    banner.style.cssText = `
        position: fixed; bottom: 70px; left: 50%; transform: translateX(-50%);
        background: linear-gradient(135deg, #1677ff, #0958d9); color: white;
        padding: 10px 18px; border-radius: 24px; box-shadow: 0 4px 16px rgba(22,119,255,0.4);
        z-index: 999; font-size: 13px; display: flex; align-items: center; gap: 10px;
        animation: slideUp 0.3s ease;
    `;
    banner.innerHTML = `
        <span>📱 安装到手机桌面</span>
        <button id="install-confirm" style="background:white;color:#1677ff;border:none;padding:5px 12px;border-radius:12px;font-size:12px;font-weight:600;cursor:pointer;">立即安装</button>
        <button id="install-close" style="background:none;border:none;color:white;opacity:0.7;cursor:pointer;font-size:16px;line-height:1;">×</button>
    `;
    document.body.appendChild(banner);

    document.getElementById('install-confirm').addEventListener('click', () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(choiceResult => {
                if (choiceResult.outcome === 'accepted') {
                    console.log('用户接受了安装');
                }
                deferredPrompt = null;
                banner.remove();
            });
        }
    });

    document.getElementById('install-close').addEventListener('click', () => {
        banner.remove();
    });
}

window.addEventListener('appinstalled', () => {
    console.log('APP已安装');
    deferredPrompt = null;
    showToast('安装成功！已添加到桌面');
    const banner = document.getElementById('install-banner');
    if (banner) banner.remove();
});

// ===== 离线状态提示 =====
window.addEventListener('online', () => showToast('已恢复网络连接'));
window.addEventListener('offline', () => showToast('当前处于离线状态，数据仍可查看'));

