(() => {
    'use strict';
    // Update these sources when replacing the latest film.
    const config = {
        video: 'assets/intro/opening-web.mp4',
        external: 'https://drive.google.com/file/d/1SmUtNsQtU0SuepRBlMSSwCDiurhdzDaN/view?usp=sharing'
    };
    const root = document.getElementById('intro-experience');
    const portfolio = document.getElementById('portfolio-content');
    if (!root || !portfolio) return;
    const get = id => document.getElementById(id);
    const video = get('intro-video');
    const panels = [...root.querySelectorAll('[data-intro-panel]')];
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let current = 0, timer, pendingSeek = null;
    const time = seconds => {
        const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
        return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
    };
    const play = async () => {
        if (root.hidden || current !== 0) return;
        try {
            await video.play();
            if (root.hidden || current !== 0) video.pause();
            get('intro-play-fallback').hidden = true;
        } catch (_) {
            get('intro-play-fallback').hidden = !video.paused || !!video.error;
        }
    };
    const icon = (id, name, label) => {
        const button = get(id);
        button.querySelector('img').src = `assets/intro/icons/${name}.svg`;
        button.setAttribute('aria-label', label);
        button.title = label;
    };
    const soundOverlay = document.createElement('button');
    soundOverlay.type = 'button';
    soundOverlay.id = 'intro-sound-overlay';
    const soundImage = document.createElement('img');
    soundImage.alt = '';
    soundOverlay.append(soundImage);
    panels[0].append(soundOverlay);
    const syncSound = () => {
        const audible = !video.muted && video.volume > 0;
        const action = audible ? '음소거' : '소리 켜기';
        const name = audible ? 'volume-2' : 'volume-x';
        icon('intro-sound', name, action);
        get('intro-sound').setAttribute('aria-pressed', String(audible));
        soundImage.src = `assets/intro/icons/${name}.svg`;
        soundOverlay.setAttribute('aria-label', action);
        soundOverlay.setAttribute('aria-pressed', String(audible));
        soundOverlay.title = action;
    };
    const setSound = enabled => {
        if (enabled && video.volume === 0) video.volume = 1;
        video.muted = !enabled;
        syncSound();
    };
    const toggleSound = () => setSound(video.muted || video.volume === 0);
    soundOverlay.addEventListener('click', toggleSound);
    const seek = seconds => {
        if (!Number.isFinite(video.duration)) { pendingSeek = seconds; return; }
        video.currentTime = Math.min(Math.max(0, seconds), Math.max(0, video.duration - 0.1));
        pendingSeek = null;
    };
    const finishTransition = () => {
        clearTimeout(timer);
        panels.forEach((panel, index) => {
            panel.hidden = index !== current;
            panel.inert = index !== current;
            panel.classList.remove('is-entering', 'is-leaving', 'is-back');
            panel.classList.toggle('is-current', index === current);
        });
    };
    const exit = () => {
        finishTransition();
        video.pause();
        root.hidden = true;
        portfolio.hidden = false;
        portfolio.inert = false;
        document.body.classList.remove('intro-open');
        window.scrollTo(0, 0);
        reopen.focus({preventScroll: true});
    };
    const go = (index, focus = true) => {
        if (index >= panels.length) { exit(); return; }
        if (index < 0 || index === current) return;
        finishTransition();
        const previous = current;
        current = index;
        const outgoing = panels[previous], incoming = panels[current];
        outgoing.inert = true;
        outgoing.classList.remove('is-current');
        outgoing.classList.add('is-leaving');
        incoming.hidden = false;
        incoming.inert = false;
        incoming.classList.add('is-current', 'is-entering');
        if (index < previous) { outgoing.classList.add('is-back'); incoming.classList.add('is-back'); }
        incoming.scrollTop = 0;
        root.querySelectorAll('[data-intro-go]').forEach(button => {
            if (Number(button.dataset.introGo) === index) button.setAttribute('aria-current', 'step');
            else button.removeAttribute('aria-current');
        });
        get('intro-prev').disabled = current === 0;
        get('intro-step-label').textContent = ['01 / 03 · OPENING FILM', '02 / 03 · PROFILE', '03 / 03 · CAPABILITIES'][current];
        get('intro-next').firstChild.textContent = ['이력 보기 ', '역량 보기 ', '전체 포트폴리오 '][current];
        if (current === 0) play(); else video.pause();
        if (focus) {
            const heading = incoming.querySelector('h1, h2');
            heading.tabIndex = -1;
            heading.focus({preventScroll: true});
        }
        timer = setTimeout(finishTransition, reduced.matches ? 0 : 320);
    };
    const graph = document.querySelector('.competency-radar svg');
    if (graph) {
        const clone = graph.cloneNode(true);
        clone.querySelectorAll('[id]').forEach(node => { node.id = `intro-${node.id}`; });
        clone.setAttribute('aria-labelledby', 'intro-radar-title intro-radar-desc');
        get('intro-radar').append(clone);
        clone.querySelectorAll('.radar-point').forEach(point => {
            point.classList.replace('radar-point', 'intro-radar-point');
            point.removeAttribute('data-radar-point');
        });
        clone.setAttribute('role', 'group');
    }
    root.querySelectorAll('[data-intro-go]').forEach(button => button.addEventListener('click', event => {
        event.preventDefault(); go(Number(button.dataset.introGo));
    }));
    root.querySelectorAll('[data-intro-exit]').forEach(button => button.addEventListener('click', exit));
    get('intro-prev').addEventListener('click', () => go(current - 1));
    get('intro-next').addEventListener('click', () => go(current + 1));
    get('intro-play').addEventListener('click', () => video.paused ? play() : video.pause());
    get('intro-play-fallback').addEventListener('click', play);
    const enableSound = () => { toggleSound(); if (video.paused) play(); };
    video.tabIndex = 0;
    video.setAttribute('aria-label', '썸머 페스티벌 만찬 오프닝 영상, 클릭 또는 Enter로 음소거 전환');
    video.addEventListener('click', enableSound);
    video.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); enableSound(); }
    });
    get('intro-play-fallback').addEventListener('click', enableSound);
    get('intro-sound').addEventListener('click', toggleSound);
    video.addEventListener('volumechange', () => syncSound());
    video.addEventListener('play', () => icon('intro-play', 'pause', '일시 정지'));
    video.addEventListener('pause', () => icon('intro-play', 'play', '영상 재생'));
    video.addEventListener('loadedmetadata', () => {
        get('intro-seek').max = video.duration;
        if (pendingSeek !== null) seek(pendingSeek);
    });
    video.addEventListener('timeupdate', () => {
        get('intro-time').textContent = `${time(video.currentTime)} / ${time(video.duration)}`;
        get('intro-seek').value = video.currentTime;
        get('intro-seek').setAttribute('aria-valuetext', time(video.currentTime));
    });
    video.addEventListener('error', () => {
        get('intro-video-error').hidden = false;
        get('intro-play-fallback').hidden = true;
    });
    video.addEventListener('ended', () => { if (!root.hidden && current === 0) go(1); });
    get('intro-seek').addEventListener('input', event => seek(Number(event.target.value)));
    get('intro-video-external').href = config.external;
    const reopen = document.createElement('button');
    reopen.type = 'button';
    reopen.className = 'intro-reopen';
    reopen.textContent = '소개 영상 보기';
    reopen.addEventListener('click', () => {
        portfolio.hidden = true;
        portfolio.inert = true;
        root.hidden = false;
        document.body.classList.add('intro-open');
        if (current !== 0) go(0); else play();
        get('intro-next').focus();
    });
    (document.querySelector('.top-utility-bar') || portfolio).prepend(reopen);
    document.addEventListener('keydown', event => {
        if (!root.hidden && event.key === 'Escape') exit();
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) video.pause(); });
    document.addEventListener('portfolio:navigate', event => {
        exit();
        if (typeof window.toggleMode === 'function') window.toggleMode(event.detail.mode, false);
        requestAnimationFrame(() => {
            const target = get(event.detail.target);
            if (target) { target.scrollIntoView({behavior: reduced.matches ? 'instant' : 'smooth', block: 'start'}); target.tabIndex = -1; target.focus({preventScroll: true}); }
        });
    });
    finishTransition();
    portfolio.hidden = true;
    portfolio.inert = true;
    root.hidden = false;
    document.body.classList.add('intro-open');
    video.muted = true;
    syncSound();
    video.src = config.video;
    play();

    // Equal sectors describe categories, not numerical proficiency scores.
    const diagram = get('tool-diagram');
    const categories = [...root.querySelectorAll('.intro-tool-category')];
    const labels = ['영상', '이미지', '음성·BGM', '편집', '보정·3D'];
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 440 440');
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-label', '제작 분야 선택');
    const defs = document.createElementNS(ns, 'defs');
    const gradient = document.createElementNS(ns, 'linearGradient');
    gradient.id = 'tool-glass';
    gradient.setAttribute('x2', '100%');
    gradient.setAttribute('y2', '100%');
    [['0%', '#163bff'], ['55%', '#3157ff'], ['100%', '#8298ff']].forEach(([offset, color]) => {
        const stop = document.createElementNS(ns, 'stop');
        stop.setAttribute('offset', offset); stop.setAttribute('stop-color', color); gradient.append(stop);
    });
    defs.append(gradient); svg.append(defs);
    const point = (radius, degrees) => {
        const radians = degrees * Math.PI / 180;
        return [220 + radius * Math.cos(radians), 220 + radius * Math.sin(radians)];
    };
    const select = index => {
        categories.forEach((category, i) => category.classList.toggle('tool-selected', i === index));
        svg.querySelectorAll('[role="button"]').forEach((sector, i) => {
            sector.setAttribute('aria-pressed', String(i === index));
            sector.classList.toggle('selected', i === index);
        });
    };
    labels.forEach((label, i) => {
        const start = -90 + i * 72 + 3, end = start + 66;
        const group = document.createElementNS(ns, 'g');
        group.setAttribute('role', 'button'); group.setAttribute('tabindex', '0');
        group.setAttribute('aria-label', `${label}: ${categories[i].querySelector('ul').textContent.trim()}`);
        group.setAttribute('class', 'tool-sector');
        const shape = document.createElementNS(ns, 'path');
        shape.setAttribute('d', `M ${point(84,start)} L ${point(192,start)} A 192 192 0 0 1 ${point(192,end)} L ${point(84,end)} A 84 84 0 0 0 ${point(84,start)} Z`);
        const text = document.createElementNS(ns, 'text');
        const [x,y] = point(139, start + 33);
        text.setAttribute('x', x); text.setAttribute('y', y); text.textContent = label;
        group.append(shape, text); svg.append(group);
        group.addEventListener('click', () => select(i));
        group.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(i); }
        });
        categories[i].addEventListener('pointerenter', () => select(i));
    });
    const center = document.createElementNS(ns, 'text');
    center.setAttribute('x', '220'); center.setAttribute('y', '222');
    center.setAttribute('class', 'tool-center'); center.textContent = 'AI + CRAFT';
    svg.append(center); diagram.append(svg); select(0);
    root.querySelectorAll('.intro-tool-category li > img').forEach(img => {
        const tile = document.createElement('span');
        tile.className = 'tool-app-icon';
        img.before(tile); tile.append(img);
    });
})();
