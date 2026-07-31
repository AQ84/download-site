(function() {
    'use strict';

    const searchInput = document.getElementById('search');
    const fileList = document.getElementById('fileList');
    const fileCount = document.getElementById('fileCount');
    const totalSize = document.getElementById('totalSize');

    let files = [];

    // 根据扩展名判断文件类型图标
    function getFileType(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const typeMap = {
            jar: 'jar', zip: 'zip', rar: 'zip', '7z': 'zip', tar: 'zip', gz: 'zip',
            exe: 'exe', msi: 'exe', dmg: 'exe', deb: 'exe', apk: 'exe',
            pdf: 'pdf', doc: 'pdf', docx: 'pdf', ppt: 'pdf', xls: 'pdf',
            png: 'img', jpg: 'img', jpeg: 'img', gif: 'img', svg: 'img', webp: 'img', ico: 'img',
            mp4: 'img', mp3: 'img', wav: 'img', flac: 'img',
            json: 'other', xml: 'other', yaml: 'other', toml: 'other',
            js: 'other', ts: 'other', py: 'other', java: 'other', cpp: 'other',
            sh: 'other', bat: 'other', ps1: 'other',
        };
        return typeMap[ext] || 'other';
    }

    function getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const iconMap = {
            jar: '☕', zip: '📦', rar: '📦', '7z': '📦', tar: '📦', gz: '📦',
            exe: '⚙️', msi: '⚙️', dmg: '⚙️', apk: '📱',
            pdf: '📄', doc: '📝', docx: '📝', ppt: '📊', xls: '📈',
            png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', svg: '🖼️',
            mp4: '🎬', mp3: '🎵', wav: '🎵', flac: '🎵',
            json: '{}', xml: '<>', yaml: '⚙', toml: '⚙',
            js: '📜', ts: '📜', py: '🐍', java: '☕', cpp: '⚡',
            sh: '💻', bat: '💻', ps1: '💻',
            txt: '📃', md: '📝', html: '🌐', css: '🎨',
        };
        return iconMap[ext] || '📁';
    }

    function formatSize(bytes) {
        if (!bytes || bytes === 0) return '未知';
        const units = ['B', 'KB', 'MB', 'GB'];
        let i = 0;
        let size = bytes;
        while (size >= 1024 && i < units.length - 1) {
            size /= 1024;
            i++;
        }
        return size.toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
    }

    function parseSizeToBytes(sizeStr) {
        if (!sizeStr) return 0;
        const match = sizeStr.toString().toLowerCase().match(/^([\d.]+)\s*(b|kb|mb|gb)?$/);
        if (!match) return 0;
        const num = parseFloat(match[1]);
        const unit = match[2] || 'b';
        const multipliers = { b: 1, kb: 1024, mb: 1024 * 1024, gb: 1024 * 1024 * 1024 };
        return Math.round(num * (multipliers[unit] || 1));
    }

    function renderFiles(filtered) {
        if (filtered.length === 0) {
            fileList.innerHTML = '<div class="empty">📭 没有找到文件</div>';
        } else {
            fileList.innerHTML = filtered.map((f, i) => {
                const type = getFileType(f.name);
                const icon = getFileIcon(f.name);
                const desc = f.description || '';
                return `
                    <div class="file-card" style="animation-delay:${i * 0.03}s">
                        <div class="file-icon ${type}">${icon}</div>
                        <div class="file-info">
                            <div class="file-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div>
                            ${desc ? `<div class="file-desc">${escapeHtml(desc)}</div>` : ''}
                            <div class="file-meta">
                                <span>📅 ${escapeHtml(f.date || '未知')}</span>
                                <span>📏 ${escapeHtml(formatSize(f.size_bytes || 0))}</span>
                                ${f.version ? `<span>🏷️ v${escapeHtml(f.version)}</span>` : ''}
                            </div>
                        </div>
                        <a href="files/${encodeURIComponent(f.name)}" class="dl-btn" download>
                            ⬇ 下载
                        </a>
                    </div>
                `;
            }).join('');
        }

        // 更新统计
        const totalBytes = filtered.reduce((sum, f) => sum + (f.size_bytes || 0), 0);
        fileCount.textContent = filtered.length;
        totalSize.textContent = formatSize(totalBytes);
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // 搜索
    searchInput.addEventListener('input', function() {
        const query = this.value.toLowerCase().trim();
        if (!query) {
            renderFiles(files);
            return;
        }
        const filtered = files.filter(f =>
            f.name.toLowerCase().includes(query) ||
            (f.description || '').toLowerCase().includes(query) ||
            (f.version || '').toLowerCase().includes(query)
        );
        renderFiles(filtered);
    });

    // 加载文件清单
    fetch('files.json')
        .then(res => {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        })
        .then(data => {
            files = (data.files || []).sort((a, b) => {
                // 按日期倒序
                if (a.date && b.date) return b.date.localeCompare(a.date);
                return 0;
            });
            renderFiles(files);
        })
        .catch(err => {
            console.error('加载文件列表失败:', err);
            fileList.innerHTML = '<div class="empty">⚠️ 加载文件列表失败，请检查 files.json</div>';
        });

    // 键盘快捷键: / 聚焦搜索
    document.addEventListener('keydown', function(e) {
        if (e.key === '/' && document.activeElement !== searchInput) {
            e.preventDefault();
            searchInput.focus();
        }
    });
})();
