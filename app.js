// ===== 仓库设备管理系统 - 主逻辑 =====

const STORAGE_KEY = 'warehouse_devices';
let photoData = { sn: '', front: '' };

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
    resetForm();
    switchPage('home');
});

function resetForm() {
    document.getElementById('entry-form').reset();
    document.getElementById('edit-id').value = '';
    photoData = { sn: '', front: '' };
    document.getElementById('sn-preview').innerHTML = '';
    document.getElementById('sn-preview').classList.remove('has-photo');
    document.getElementById('sn-photo-box').querySelector('.photo-placeholder').style.display = 'flex';
    document.getElementById('front-preview').innerHTML = '';
    document.getElementById('front-preview').classList.remove('has-photo');
    document.getElementById('front-photo-box').querySelector('.photo-placeholder').style.display = 'flex';
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

    let ocrBtn = type === 'sn'
        ? `<button class="photo-ocr-btn" onclick="ocrFromImage('${imgSrc.slice(0, 50)}...')">🔍 识别SN</button>`
        : '';

    preview.innerHTML = `
        <img src="${imgSrc}" onclick="showImgModal('${imgSrc}')">
        <button class="photo-remove" onclick="removePhoto('${type}')">×</button>
        ${ocrBtn}
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

// ===== OCR识别 =====
let ocrWorker = null;

async function getOCRWorker() {
    if (!ocrWorker) {
        showOCRMask('正在加载OCR引擎...');
        ocrWorker = await Tesseract.createWorker('eng+chi_sim', 1, {
            logger: m => {
                if (m.status === 'recognizing text') {
                    updateOCRText(`识别中... ${Math.round(m.progress * 100)}%`);
                }
            }
        });
    }
    return ocrWorker;
}

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

// 拍照并OCR识别
function captureAndOCR(target) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async function (e) {
        const file = e.target.files[0];
        if (!file) return;

        showOCRMask('正在识别文字...');

        try {
            const dataUrl = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = ev => resolve(ev.target.result);
                reader.readAsDataURL(file);
            });

            const compressed = await compressImage(dataUrl, 1200, 0.85);

            // 如果是录入页SN输入框，同时保存SN图片
            if (target === 'sn') {
                photoData.sn = compressed;
                showPhotoPreview('sn', compressed);
            }

            const worker = await getOCRWorker();
            const { data: { text } } = await worker.recognize(compressed);

            // 清理识别结果，提取可能的SN码
            const cleaned = cleanOCRText(text);

            hideOCRMask();

            if (target === 'sn') {
                document.getElementById('sn').value = cleaned;
                showToast('识别完成');
            } else if (target === 'search') {
                document.getElementById('search-input').value = cleaned;
                doSearch();
            }
        } catch (err) {
            console.error(err);
            hideOCRMask();
            showToast('识别失败，请重试');
        }
    };
    input.click();
}

// 从已上传图片OCR
function ocrFromImage(dataUrl) {
    // 重新获取完整图片
    const fullSrc = document.querySelector('#sn-preview img').src;
    showOCRMask('正在识别文字...');

    (async () => {
        try {
            const worker = await getOCRWorker();
            const { data: { text } } = await worker.recognize(fullSrc);
            const cleaned = cleanOCRText(text);
            hideOCRMask();
            document.getElementById('sn').value = cleaned;
            showToast('识别完成');
        } catch (err) {
            console.error(err);
            hideOCRMask();
            showToast('识别失败');
        }
    })();
}

// 清理OCR文本，提取SN码
function cleanOCRText(text) {
    if (!text) return '';
    // 去除多余空白，保留字母数字和常见符号
    let cleaned = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    // 尝试提取SN码相关行
    const snMatch = cleaned.match(/(?:SN|Serial|序列号|sn)[::\s]*([A-Za-z0-9\-_]{4,})/i);
    if (snMatch) {
        return snMatch[1];
    }
    // 如果提取不到，返回清理后的文本
    return cleaned.substring(0, 50);
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

    renderStatList('type-stats', groupBy(devices, 'type'), '种');
    renderStatList('status-stats', groupBy(devices, 'status'), '项');
    renderStatList('mfr-stats', groupBy(devices, 'manufacturer'), '项');
    renderStatList('location-stats', groupBy(devices, 'location'), '项');
}

function groupBy(arr, key) {
    const result = {};
    arr.forEach(item => {
        const k = item[key] || '未填写';
        result[k] = (result[k] || 0) + 1;
    });
    return Object.entries(result).sort((a, b) => b[1] - a[1]);
}

function renderStatList(elId, data, unit) {
    const el = document.getElementById(elId);
    const max = data.length > 0 ? data[0][1] : 1;

    if (data.length === 0) {
        el.innerHTML = '<p class="empty-tip">暂无数据</p>';
        return;
    }

    el.innerHTML = data.slice(0, 10).map(([label, count]) => `
        <div class="stat-row">
            <span class="label">${label}</span>
            <div class="stat-bar"><div class="stat-bar-fill" style="width:${(count / max) * 100}%"></div></div>
            <span class="value">${count}${unit}</span>
        </div>
    `).join('');
}

// ===== 导出Excel =====
function exportExcel() {
    const devices = getDevices();
    if (devices.length === 0) {
        showToast('暂无数据可导出');
        return;
    }

    const exportData = devices.map(d => ({
        '厂家': d.manufacturer,
        '设备/备件类型': d.type,
        '设备/备件名称': d.name,
        '设备/备件型号': d.model,
        '设备序列号SN码': d.sn,
        '数量': d.quantity,
        '单位': d.unit,
        '设备/备件使用状态': d.status,
        '存放地点': d.location,
        '备注': d.remark,
        '出库记录': d.outbound,
        '录入时间': formatDate(d.createdAt)
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '仓库设备数据');

    // 设置列宽
    ws['!cols'] = [
        { wch: 15 }, { wch: 12 }, { wch: 18 }, { wch: 15 }, { wch: 20 },
        { wch: 8 }, { wch: 6 }, { wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 18 }
    ];

    const now = new Date();
    const pad = n => n.toString().padStart(2, '0');
    const filename = `仓库设备数据_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.xlsx`;

    XLSX.writeFile(wb, filename);
    showToast('导出成功！');
}

// ===== 图片大图 =====
function showImgModal(src) {
    document.getElementById('img-modal-content').src = src;
    document.getElementById('img-modal').classList.add('show');
}

function closeImgModal() {
    document.getElementById('img-modal').classList.remove('show');
}

// ===== 初始化 =====
window.addEventListener('DOMContentLoaded', () => {
    updateHome();
});

// ===== PWA Service Worker 注册 =====
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
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

