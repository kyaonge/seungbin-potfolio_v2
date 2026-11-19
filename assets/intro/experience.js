(() => {
    'use strict';
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const make = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    };
    const navigate = (mode, target) => document.dispatchEvent(new CustomEvent('portfolio:navigate', {detail: {mode, target}}));
    const coding = document.querySelector('.vibe-tech-block');
    if (coding) coding.id = 'coding-work';
    const records = [
        {name: '영상 제작', task: '기획 · 촬영 · 편집 · AI 합성', proof: '내부 홍보·행사 브릿지 영상 제작', target: 'work-video-heading', mode: 'shinhan', image: 'assets/img/07_인슈테크선도.jpg'},
        {name: 'SNS 마케팅', task: '채널 운영 · IP 프로모션 · 이벤트', proof: '위즈스타 팔로워 806 → 2,051 / 리뉴얼 후 2개월', target: 'storywiz-marketing', mode: 'storywiz', image: 'slides/page_17.jpg'},
        {name: '콘텐츠 MD', task: '구작 큐레이션 · 유통 채널 확대', proof: '구작 100여 종 관리 · 18개월 이상 매출 유지', target: 'storywiz-distribution', mode: 'storywiz', image: 'slides/page_5.jpg'},
        {name: '바이브 코딩', task: '제작 보조 도구 · API 연동 · 자동화', proof: '프롬프트 제작기 · 이미지 생성기 직접 개발', target: 'coding-work', mode: 'shinhan', image: 'program1 (1).png'},
        {name: '계약 관리', task: '제휴사 계약 갱신 · 부속 합의 · 입점 협의', proof: '주요 유통대행사 4곳 계약 연장', target: 'storywiz-distribution', mode: 'storywiz', image: 'slides/page_5.jpg'},
        {name: '데이터 분석', task: '운영 지표 분석 · 코드·양식 표준화', proof: '시리즈 코드 기반 업무 시트 연동', target: 'storywiz-automation', mode: 'storywiz', image: 'slides/page_10.jpg'}
    ];
    const views = [];
    const selectSkill = index => views.forEach(view => {
        const record = records[index];
        view.buttons.forEach((button, i) => {
            button.setAttribute('aria-pressed', String(i === index));
            button.classList.toggle('is-active', i === index);
        });
        view.points.forEach((point, i) => {
            point.setAttribute('aria-pressed', String(i === index));
            point.classList.toggle('is-active', i === index);
        });
        view.title.textContent = record.name;
        view.task.textContent = record.task;
        view.proof.textContent = record.proof;
        view.image.src = record.image;
        view.image.alt = `${record.name} 관련 실무 자료`;
        view.link.href = `#${record.target}`;
        view.link.onclick = event => { event.preventDefault(); navigate(record.mode, record.target); };
    });
    const setups = [
        {host: document.querySelector('.intro-graph'), svg: document.querySelector('#intro-radar svg'), controls: document.querySelector('.intro-skill-labels'), intro: true},
        {host: document.querySelector('#portfolio-content .competency-radar-wrap'), svg: document.querySelector('#portfolio-content .competency-radar svg'), controls: document.querySelector('#portfolio-content .radar-controls'), intro: false}
    ];
    setups.forEach(({host, svg, controls, intro}) => {
        if (!host || !svg || !controls) return;
        host.classList.add('skill-explorer');
        svg.setAttribute('role', 'group');
        svg.querySelector('title').textContent = '실무 역량과 관련 작업물 탐색';
        svg.querySelector('desc').textContent = '여섯 분야 중 하나를 선택하면 실제 업무와 근거 자료가 표시됩니다. 점수 그래프가 아닙니다.';
        const coords = [[250,70],[406,160],[406,340],[250,430],[94,340],[94,160]];
        svg.querySelector('.radar-shape').setAttribute('points', coords.map(p => p.join(',')).join(' '));
        const points = [...svg.querySelectorAll('.radar-point, .intro-radar-point')];
        points.forEach((point, i) => {
            point.setAttribute('cx', coords[i][0]); point.setAttribute('cy', coords[i][1]);
            point.setAttribute('role', 'button'); point.setAttribute('tabindex', '0');
            point.setAttribute('aria-label', `${records[i].name} 실무 보기`);
            point.addEventListener('click', () => selectSkill(i));
            point.addEventListener('focus', () => selectSkill(i));
            point.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectSkill(i); }
                if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); points[(i + (event.key === 'ArrowRight' ? 1 : 5)) % 6].focus(); }
            });
            const number = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            number.setAttribute('x', coords[i][0]); number.setAttribute('y', coords[i][1] + 1);
            number.setAttribute('class', 'skill-node-label'); number.textContent = i + 1;
            svg.append(number);
        });
        controls.replaceChildren();
        const buttons = records.map((record, i) => {
            const button = make('button', intro ? '' : 'radar-skill');
            button.type = 'button'; button.append(make('b', 'skill-number', String(i + 1)), make('span', '', record.name));
            button.addEventListener('click', () => selectSkill(i));
            button.addEventListener('focus', () => selectSkill(i));
            controls.append(button); return button;
        });
        const evidence = make('div', 'skill-evidence');
        const image = make('img'); image.loading = 'lazy';
        const copy = make('div');
        const title = make('strong'), task = make('p'), proof = make('p', 'skill-proof'), link = make('a', 'skill-evidence-link', '관련 업무·작업물 보기');
        copy.append(title, task, proof, link); evidence.append(image, copy); host.append(evidence);
        if (intro) host.querySelector(':scope > p').textContent = '역량별 실무 · 근거 자료';
        views.push({buttons, points, title, task, proof, image, link});
    });
    selectSkill(0);

    const history = document.querySelector('.history-list');
    const careerRows = [
        ['신한금융플러스', 'SNS 마케터 · AI 영상 · 행사 PM', 'shinhan', 'identity-shinhan'],
        ['KT 스토리위즈', '콘텐츠 MD · 제휴·계약 · SNS', 'storywiz', 'identity-storywiz'],
        ['연세대학교 미래캠퍼스', '국어국문학과 졸업', 'academic', 'academic-awards'],
        ['미래인재개발원', '학부생 인턴 · 홈페이지·SNS 운영', 'academic', 'academic-projects'],
        ['뮤지엄산', '전시장 서포터즈', 'academic', 'academic-projects']
    ];
    if (history) [...history.children].forEach((row, i) => {
        const date = row.querySelector('.date'), note = row.querySelector('.history-note');
        const [name, role, mode, target] = careerRows[i];
        const detail = make('div', 'career-row-copy');
        detail.append(make('strong', '', name), make('span', '', role));
        if (note) detail.append(note);
        const link = make('a', 'career-row-link', '보기'); link.href = `#${target}`;
        link.addEventListener('click', event => { event.preventDefault(); navigate(mode, target); });
        row.replaceChildren(date, detail, link); row.dataset.company = mode;
    });

    // Native scrolling keeps links usable and preserves touch/trackpad behavior.
    const folderize = (track, label) => {
        const cards = [...track.children];
        if (cards.length < 2) return;
        const shell = make('div', 'folder-carousel');
        shell.setAttribute('role', 'region'); shell.setAttribute('aria-label', label);
        track.before(shell); shell.append(track);
        track.classList.add('folder-track'); track.tabIndex = 0;
        track.setAttribute('aria-label', `${label} 영상 목록`);
        cards.forEach((card, i) => {
            card.classList.add('folder-card');
            card.prepend(make('span', 'folder-tab', `${String(i + 1).padStart(2, '0')} / ${label}`));
        });
        const controls = make('div', 'folder-controls');
        const count = make('span', 'folder-count'); count.setAttribute('aria-live', 'polite');
        const button = (icon, label) => {
            const b = make('button'); b.type = 'button'; b.title = label; b.setAttribute('aria-label', label);
            const image = make('img'); image.src = `assets/intro/icons/${icon}.svg`; image.alt = ''; b.append(image); return b;
        };
        const prev = button('arrow-left', '이전 영상'), next = button('arrow-right', '다음 영상');
        let active = 0;
        const update = () => {
            const left = track.getBoundingClientRect().left;
            let nearest = Infinity;
            cards.forEach((card, i) => { const distance = Math.abs(card.getBoundingClientRect().left - left); if (distance < nearest) {nearest = distance; active = i;} });
            cards.forEach((card, i) => card.classList.toggle('folder-active', i === active));
            count.textContent = `${String(active + 1).padStart(2, '0')} / ${String(cards.length).padStart(2, '0')}`;
            prev.disabled = track.scrollLeft <= 2;
            next.disabled = track.scrollWidth - track.clientWidth - track.scrollLeft <= 2;
        };
        const move = delta => {
            const index = Math.max(0, Math.min(cards.length - 1, active + delta));
            const offset = cards[index].getBoundingClientRect().left - track.getBoundingClientRect().left + track.scrollLeft;
            track.scrollTo({left: offset, behavior: reduced.matches ? 'instant' : 'smooth'});
        };
        prev.addEventListener('click', () => move(-1)); next.addEventListener('click', () => move(1));
        track.addEventListener('keydown', event => {
            if (event.target !== track) return;
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1); }
        });
        track.addEventListener('scroll', update, {passive: true});
        track.addEventListener('focusin', event => {
            const card = event.target.closest('.folder-card');
            if (card) track.scrollTo({left: card.getBoundingClientRect().left - track.getBoundingClientRect().left + track.scrollLeft, behavior: 'instant'});
        });
        controls.append(count, prev, next); shell.append(controls);
        new ResizeObserver(update).observe(track); update();
    };
    [ ['.latest-work-grid', '주요 작업물'], ['.feature-work-grid', '대표 실무'], ['.additional-work-grid', '추가 실무'], ['.personal-video-list', '개인 영상'] ].forEach(([selector, label]) => {
        document.querySelectorAll(selector).forEach(track => folderize(track, label));
    });
    const recent = document.querySelector('.personal-current-project');
    if (recent) {
        const track = make('div');
        const links = [...recent.querySelectorAll(':scope > .personal-video-card')];
        if (links.length) { links[0].before(track); links.forEach(link => track.append(link)); folderize(track, '최근 작업'); }
    }
})();
