(function() {
    'use strict';

    const searchInput = document.getElementById('search');
    const fileList = document.getElementById('fileList');
    const fileCount = document.getElementById('fileCount');
    const totalSize = document.getElementById('totalSize');

    let packages = [];
    let files = [];

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // 渲染有直链URL的包（如 GitHub Release）
    function renderUrlPackage(pkg) {
        const sizeStr = pkg.size_mb ? pkg.size_mb + ' MB' : '';
        return `
        <div class="pkg-card url-pkg">
            <div class="pkg-header">
                <div class="pkg-icon">📦</div>
                <div class="pkg-info">
                    <div class="pkg-name">${escapeHtml(pkg.name)}</div>
                    <div class="pkg-meta">
                        <span>📅 ${escapeHtml(pkg.date || '')}</span>
                        ${pkg.version ? `<span>🏷️ v${escapeHtml(pkg.version)}</span>` : ''}
                        ${sizeStr ? `<span>📏 ${escapeHtml(sizeStr)}</span>` : ''}
                        <span class="pkg-format">.${escapeHtml(pkg.format || '')}</span>
                    </div>
                    ${pkg.description ? `<div class="pkg-desc">${escapeHtml(pkg.description)}</div>` : ''}
                    ${pkg.notes ? `<div class="pkg-notes">📌 ${escapeHtml(pkg.notes)}</div>` : ''}
                </div>
                <a href="${escapeHtml(pkg.url)}" class="dl-btn" target="_blank" rel="noopener" onclick="this.textContent='⏳ 下载中...'">
                    ⬇ 下载
                </a>
            </div>
        </div>`;
    }

    // 渲染有分卷的包（本地文件）
    function renderPartsPackage(pkg) {
        const parts = pkg.parts || [];
        const ext = pkg.format || '';
        return `
        <div class="pkg-card">
            <div class="pkg-header" onclick="this.parentElement.classList.toggle('open')">
                <div class="pkg-icon">📦</div>
                <div class="pkg-info">
                    <div class="pkg-name">${escapeHtml(pkg.name)}</div>
                    <div class="pkg-meta">
                        <span>📅 ${escapeHtml(pkg.date || '')}</span>
                        ${pkg.version ? `<span>🏷️ v${escapeHtml(pkg.version)}</span>` : ''}
                        <span>🧩 ${parts.length} 个文件</span>
                        <span class="pkg-format">.${escapeHtml(ext)}</span>
                    </div>
                    ${pkg.description ? `<div class="pkg-desc">${escapeHtml(pkg.description)}</div>` : ''}
                </div>
                <div class="pkg-toggle">▸</div>
            </div>
            <div class="pkg-parts">
                ${pkg.merge_cmd ? `
                <div class="merge-hint">
                    <div class="merge-cmd">
                        <span class="merge-label">📋 合并命令 (CMD)：</span>
                        <code>${escapeHtml(pkg.merge_cmd)}</code>
                    </div>
                    <button class="copy-btn" onclick="navigator.clipboard.writeText(this.parentElement.querySelector('code').textContent); this.textContent='✅ 已复制'; setTimeout(()=>this.textContent='📋 复制',2000)">📋 复制</button>
                </div>` : ''}
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

    function renderFile(f, i) {
        const desc = f.description || '';
        return `
        <div class="file-card" style="animation-delay:${i * 0.02}s">
            <div class="file-icon other">📁</div>
            <div class="file-info">
                <div class="file-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div>
                ${desc ? `<div class="file-desc">${escapeHtml(desc)}</div>` : ''}
                <div class="file-meta">
                    <span>📅 ${escapeHtml(f.date || '')}</span>
                    ${f.version ? `<span>🏷️ v${escapeHtml(f.version)}</span>` : ''}
                </div>
            </div>
            <a href="files/${encodeURIComponent(f.name)}" class="dl-btn" download>⬇ 下载</a>
        </div>`;
    }

    function renderAll(pkgs, fls) {
        const html = pkgs.map(p => {
            if (p.url) return renderUrlPackage(p);
            return renderPartsPackage(p);
        }).join('') +
        (fls.length ? '<div class="section-title">📄 单文件</div>' + fls.map((f, i) => renderFile(f, i)).join('') : '');

        if (!pkgs.length && !fls.length) {
            fileList.innerHTML = '<div class="empty">📭 没有找到文件</div>';
        } else {
            fileList.innerHTML = html;
        }

        fileCount.textContent = fls.length + pkgs.length;
        totalSize.textContent = '';
    }

    function doSearch() {
        const q = searchInput.value.toLowerCase().trim();
        if (!q) { renderAll(packages, files); return; }
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

    fetch('files.json')
        .then(res => res.json())
        .then(data => {
            packages = data.packages || [];
            files = data.files || [];
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
