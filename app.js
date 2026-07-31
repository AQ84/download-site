(function() {
    'use strict';

    const searchInput = document.getElementById('search');
    const fileList = document.getElementById('fileList');
    const fileCount = document.getElementById('fileCount');
    const totalSize = document.getElementById('totalSize');

    let packages = [];
    let files = [];

    function getFileType(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const m = {
            jar:'jar', zip:'zip', rar:'zip', '7z':'zip', tar:'zip', gz:'zip', bz2:'zip', xz:'zip',
            exe:'exe', msi:'exe', apk:'exe',
            pdf:'pdf',
            png:'img', jpg:'img', jpeg:'img', gif:'img', svg:'img', webp:'img',
            mp4:'img', mp3:'img', wav:'img', flac:'img',
            aa:'part', ab:'part', ac:'part', ad:'part', ae:'part', af:'part', ag:'part',
            ah:'part', ai:'part', aj:'part', ak:'part', al:'part', am:'part', an:'part',
            ao:'part', ap:'part', aq:'part', ar:'part', as:'part', at:'part', au:'part',
            av:'part', aw:'part', ax:'part', ay:'part', az:'part', ba:'part', bb:'part',
            bc:'part', bd:'part', be:'part', bf:'part', bg:'part', bh:'part', bi:'part',
            bj:'part', bk:'part', bl:'part', bm:'part', bn:'part', bo:'part', bp:'part',
            bq:'part', br:'part', bs:'part', bt:'part',
        };
        return m[ext] || 'other';
    }

    function getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const m = {
            jar:'☕', zip:'📦', rar:'📦', '7z':'📦', tar:'📦', gz:'📦',
            exe:'⚙️', apk:'📱', pdf:'📄',
            png:'🖼️', jpg:'🖼️', jpeg:'🖼️', gif:'🖼️', svg:'🖼️',
            mp4:'🎬', mp3:'🎵', wav:'🎵',
            json:'{}', xml:'<>', js:'📜', ts:'📜', py:'🐍', java:'☕',
            sh:'💻', bat:'💻', ps1:'💻', txt:'📃', md:'📝', html:'🌐', css:'🎨',
            aa:'🧩', ab:'🧩', ac:'🧩',
        };
        return m[ext] || '📁';
    }

    function formatSize(bytes) {
        if (!bytes || bytes === 0) return '';
        const units = ['B', 'KB', 'MB', 'GB'];
        let i = 0, size = bytes;
        while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
        return size.toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // 渲染分组包
    function renderPackage(pkg) {
        const parts = pkg.parts || [];
        const ext = pkg.format || pkg.parts[0]?.split('.').slice(-1)[0] || '';
        const partSize = formatSize(20 * 1024 * 1024); // 20MB per part
        const pkgId = 'pkg-' + (pkg.id || Math.random().toString(36));

        return `
        <div class="pkg-card">
            <div class="pkg-header" onclick="this.parentElement.classList.toggle('open')">
                <div class="pkg-icon">📦</div>
                <div class="pkg-info">
                    <div class="pkg-name">${escapeHtml(pkg.name)}</div>
                    <div class="pkg-meta">
                        <span>📅 ${escapeHtml(pkg.date || '')}</span>
                        ${pkg.version ? `<span>🏷️ v${escapeHtml(pkg.version)}</span>` : ''}
                        <span>🧩 ${parts.length} 个分卷</span>
                        <span class="pkg-format">.${escapeHtml(ext)}</span>
                    </div>
                    ${pkg.description ? `<div class="pkg-desc">${escapeHtml(pkg.description)}</div>` : ''}
                </div>
                <div class="pkg-toggle">▸</div>
            </div>
            <div class="pkg-parts" id="${pkgId}">
                <div class="merge-hint">
                    <div class="merge-cmd">
                        <span class="merge-label">📋 合并命令 (CMD)：</span>
                        <code>${escapeHtml(pkg.merge_cmd || '')}</code>
                    </div>
                    <button class="copy-btn" onclick="navigator.clipboard.writeText(this.parentElement.querySelector('code').textContent); this.textContent='✅ 已复制'; setTimeout(()=>this.textContent='📋 复制',2000)">📋 复制</button>
                </div>
                <div class="parts-grid">
                    ${parts.map((name, i) => `
                        <a href="files/${encodeURIComponent(name)}" class="part-item" download>
                            <span class="part-num">#${i + 1}</span>
                            <span class="part-name">${escapeHtml(name)}</span>
                            <span class="part-dl">⬇</span>
                        </a>
                    `).join('')}
                </div>
            </div>
        </div>`;
    }

    // 渲染单文件
    function renderFile(f, i) {
        const type = getFileType(f.name);
        const icon = getFileIcon(f.name);
        const desc = f.description || '';
        return `
        <div class="file-card" style="animation-delay:${i * 0.02}s">
            <div class="file-icon ${type}">${icon}</div>
            <div class="file-info">
                <div class="file-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div>
                ${desc ? `<div class="file-desc">${escapeHtml(desc)}</div>` : ''}
                <div class="file-meta">
                    <span>📅 ${escapeHtml(f.date || '')}</span>
                    ${f.size_bytes ? `<span>📏 ${formatSize(f.size_bytes)}</span>` : ''}
                    ${f.version ? `<span>🏷️ v${escapeHtml(f.version)}</span>` : ''}
                </div>
            </div>
            <a href="files/${encodeURIComponent(f.name)}" class="dl-btn" download>⬇ 下载</a>
        </div>`;
    }

    function renderAll(pkgs, fls) {
        const pkgsHtml = pkgs.map(p => renderPackage(p)).join('');
        const flsHtml = fls.length ? '<div class="section-title">📄 单文件</div>' + fls.map((f, i) => renderFile(f, i)).join('') : '';

        if (!pkgs.length && !fls.length) {
            fileList.innerHTML = '<div class="empty">📭 没有找到文件</div>';
        } else {
            fileList.innerHTML = pkgsHtml + flsHtml;
        }

        const totalParts = pkgs.reduce((s, p) => s + (p.parts || []).length, 0);
        fileCount.textContent = fls.length + pkgs.length;
        totalSize.textContent = (totalParts > 0 || fls.length > 0) ? '' : '0';
        if (totalParts > 0) {
            totalSize.textContent = totalParts + ' 个分包';
        }
    }

    // 搜索
    function doSearch() {
        const q = searchInput.value.toLowerCase().trim();
        if (!q) {
            renderAll(packages, files);
            return;
        }
        const fp = packages.filter(p =>
            p.name.toLowerCase().includes(q) ||
            (p.description || '').toLowerCase().includes(q) ||
            (p.version || '').toLowerCase().includes(q)
        );
        const ff = files.filter(f =>
            f.name.toLowerCase().includes(q) ||
            (f.description || '').toLowerCase().includes(q) ||
            (f.version || '').toLowerCase().includes(q)
        );
        renderAll(fp, ff);
    }

    searchInput.addEventListener('input', doSearch);

    // 加载
    fetch('files.json')
        .then(res => res.json())
        .then(data => {
            packages = data.packages || [];
            files = (data.files || []).sort((a, b) => {
                if (a.date && b.date) return b.date.localeCompare(a.date);
                return 0;
            });
            renderAll(packages, files);
        })
        .catch(err => {
            console.error('加载失败:', err);
            fileList.innerHTML = '<div class="empty">⚠️ 加载文件列表失败</div>';
        });

    document.addEventListener('keydown', function(e) {
        if (e.key === '/' && document.activeElement !== searchInput) {
            e.preventDefault();
            searchInput.focus();
        }
    });
})();
