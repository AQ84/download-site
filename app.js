(function() {
    'use strict';

    const searchInput = document.getElementById('search');
    const content = document.getElementById('content');
    const breadcrumb = document.getElementById('breadcrumb');
    const resultInfo = document.getElementById('resultInfo');

    let data = null;
    let currentCat = null;

    function esc(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    // === 分类列表（文件夹视图） ===
    function renderCategories(cats) {
        breadcrumb.innerHTML = '<span class="bc-home">📂 全部</span>';
        const filtered = filterCats(cats);
        if (!filtered.length) {
            content.innerHTML = '<div class="empty">📭 没有匹配的分类</div>';
            resultInfo.textContent = '';
            return;
        }
        content.innerHTML = filtered.map(c => {
            const pkgCount = (c.packages || []).length;
            const fileCount = (c.files || []).length;
            const total = pkgCount + fileCount;
            return `
            <div class="folder-card" onclick="window._goto('${c.id}')">
                <div class="folder-icon">📁</div>
                <div class="folder-info">
                    <div class="folder-name">${esc(c.name)}</div>
                    <div class="folder-desc">${esc(c.desc || '')}</div>
                </div>
                <div class="folder-count">${total} 项</div>
            </div>`;
        }).join('');
        resultInfo.textContent = filtered.length + ' 个分类';
    }

    function filterCats(cats) {
        const q = searchInput.value.toLowerCase().trim();
        if (!q) return cats;
        return cats.filter(c => {
            const inner = [...(c.packages || []), ...(c.files || [])];
            return c.name.toLowerCase().includes(q) ||
                   inner.some(i => (i.name || '').toLowerCase().includes(q) ||
                                   (i.description || '').toLowerCase().includes(q));
        });
    }

    // === 分类详情 ===
    function renderCategory(cat) {
        breadcrumb.innerHTML = `<span class="bc-link" onclick="window._goto('')">📂 全部</span> <span class="bc-sep">›</span> <span class="bc-current">${esc(cat.name)}</span>`;

        const pkgs = cat.packages || [];
        const fls = cat.files || [];

        const q = searchInput.value.toLowerCase().trim();
        const fpkgs = q ? pkgs.filter(p => matchPkg(p, q)) : pkgs;
        const ffls = q ? fls.filter(f => matchFile(f, q)) : fls;

        let html = '';
        if (fpkgs.length) {
            html += '<div class="section-title">📦 包</div>';
            html += fpkgs.map(p => p.url ? renderUrlPkg(p) : renderPartsPkg(p)).join('');
        }
        if (ffls.length) {
            html += '<div class="section-title">📄 文件</div>';
            html += ffls.map((f, i) => renderFile(f, i)).join('');
        }
        if (!html) html = '<div class="empty">📭 此分类暂无文件</div>';

        content.innerHTML = html;
        resultInfo.textContent = (fpkgs.length + ffls.length) + ' 个文件';
    }

    function matchPkg(p, q) {
        return (p.name || '').toLowerCase().includes(q) ||
               (p.description || '').toLowerCase().includes(q);
    }
    function matchFile(f, q) {
        return (f.name || '').toLowerCase().includes(q) ||
               (f.description || '').toLowerCase().includes(q);
    }

    // === 渲染组件 ===
    function renderUrlPkg(pkg) {
        return `
        <div class="pkg-card url-pkg">
            <div class="pkg-header">
                <div class="pkg-icon">📦</div>
                <div class="pkg-info">
                    <div class="pkg-name">${esc(pkg.name)}</div>
                    <div class="pkg-meta">
                        ${pkg.date ? '<span>📅 '+esc(pkg.date)+'</span>' : ''}
                        ${pkg.version ? '<span>🏷️ v'+esc(pkg.version)+'</span>' : ''}
                        ${pkg.size_mb ? '<span>📏 '+esc(String(pkg.size_mb))+' MB</span>' : ''}
                        <span>.${esc(pkg.format||'')}</span>
                    </div>
                    ${pkg.description ? '<div class="pkg-desc">'+esc(pkg.description)+'</div>' : ''}
                    ${pkg.notes ? '<div class="pkg-notes">📌 '+esc(pkg.notes)+'</div>' : ''}
                </div>
                <a href="${esc(pkg.url)}" class="dl-btn" target="_blank">⬇ 下载</a>
            </div>
        </div>`;
    }

    function renderPartsPkg(pkg) {
        const parts = pkg.parts || [];
        return `
        <div class="pkg-card">
            <div class="pkg-header" onclick="this.parentElement.classList.toggle('open')">
                <div class="pkg-icon">📦</div>
                <div class="pkg-info">
                    <div class="pkg-name">${esc(pkg.name)}</div>
                    <div class="pkg-meta">
                        ${pkg.date ? '<span>📅 '+esc(pkg.date)+'</span>' : ''}
                        ${pkg.version ? '<span>🏷️ v'+esc(pkg.version)+'</span>' : ''}
                        <span>🧩 ${parts.length} 文件</span>
                        <span>.${esc(pkg.format||'')}</span>
                    </div>
                    ${pkg.description ? '<div class="pkg-desc">'+esc(pkg.description)+'</div>' : ''}
                </div>
                <div class="pkg-toggle">▸</div>
            </div>
            <div class="pkg-parts">
                ${pkg.merge_cmd ? '<div class="merge-hint"><div class="merge-cmd"><span class="merge-label">📋 合并:</span><code>'+esc(pkg.merge_cmd)+'</code></div><button class="copy-btn" onclick="var c=this.parentElement.querySelector(\'code\').textContent;navigator.clipboard.writeText(c);this.textContent=\'✅\';setTimeout(()=>this.textContent=\'📋 复制\',2000)">📋 复制</button></div>' : ''}
                <div class="parts-grid">
                    ${parts.map((name, i) => `<a href="files/${encodeURIComponent(name)}" class="part-item" download><span class="part-num">#${i+1}</span><span class="part-name">${esc(name)}</span><span class="part-dl">⬇</span></a>`).join('')}
                </div>
            </div>
        </div>`;
    }

    function renderFile(f, i) {
        return `
        <div class="file-card" style="animation-delay:${i*0.02}s">
            <div class="file-icon other">📁</div>
            <div class="file-info">
                <div class="file-name">${esc(f.name)}</div>
                ${f.description ? '<div class="file-desc">'+esc(f.description)+'</div>' : ''}
                <div class="file-meta">
                    ${f.date ? '<span>📅 '+esc(f.date)+'</span>' : ''}
                    ${f.version ? '<span>🏷️ v'+esc(f.version)+'</span>' : ''}
                </div>
            </div>
            <a href="files/${encodeURIComponent(f.name)}" class="dl-btn" download>⬇ 下载</a>
        </div>`;
    }

    // === 导航 ===
    window._goto = function(catId) {
        if (!catId) {
            currentCat = null;
            renderCategories(data.categories || []);
        } else {
            currentCat = catId;
            const cat = (data.categories || []).find(c => c.id === catId);
            if (cat) renderCategory(cat);
        }
        searchInput.value = '';
    };

    // === 搜索 ===
    searchInput.addEventListener('input', function() {
        if (!data) return;
        if (currentCat) {
            const cat = (data.categories || []).find(c => c.id === currentCat);
            if (cat) renderCategory(cat);
        } else {
            renderCategories(data.categories || []);
        }
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === '/' && document.activeElement !== searchInput) {
            e.preventDefault();
            searchInput.focus();
        }
    });

    // === 加载 ===
    fetch('files.json')
        .then(r => r.json())
        .then(d => {
            data = d;
            renderCategories(d.categories || []);
        })
        .catch(err => {
            content.innerHTML = '<div class="empty">⚠️ 加载失败</div>';
        });
})();
