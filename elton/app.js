(() => {
  const $ = (s) => document.querySelector(s);
  const grid = $("#grid");
  const overlay = $("#overlay");
  const tracksEl = $("#tracks");
  const songInfo = $("#songInfo");
  const searchEl = $("#search");
  const countEl = $("#count");

  // Sections, in the order they appear on the page
  const TYPES = [
    { id: "studio", label: "Studio Albums", one: "Studio album" },
    { id: "soundtrack", label: "Soundtracks & Musicals", one: "Soundtrack" },
    { id: "live", label: "Live Albums", one: "Live album" },
    { id: "compilation", label: "Greatest Hits", one: "Compilation" },
  ];
  const typeOf = (a) => a.type || "studio";
  const typeInfo = (a) => TYPES.find((t) => t.id === typeOf(a));

  let era = "all";
  let kind = "all";
  let query = "";
  let current = null; // current album
  let lastFocus = null;

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  // Looser key for matching the same song across albums ("Rocket Man (I Think…)" ~ "Rocket Man")
  const songKey = (s) => norm(s).replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, "");

  // Keep albums in release order, even if data.js lists them out of order
  ALBUMS.sort((x, y) => x.year - y.year);

  // Normalise tracks into objects
  ALBUMS.forEach((a) => {
    a.tracks = a.tracks.map((t, i) => {
      const [title, note, writers, from] = Array.isArray(t) ? t : [t];
      return { n: i + 1, title, note: note || "", writers: writers || a.writers || DEFAULT_WRITERS, from: from || "" };
    });
  });
  const byTitle = (title) => ALBUMS.find((a) => norm(a.title) === norm(title));

  // For hits/live albums: borrow the story and "originally on" album from where the song first appeared
  // Same song if titles match ignoring punctuation, with or without a bracketed subtitle
  const fullKey = (s) => norm(s).replace(/[^a-z0-9]/g, "");
  const sameTitle = (a, b) => {
    const A = [songKey(a), fullKey(a)], B = [songKey(b), fullKey(b)];
    return A.some((x) => x && B.includes(x));
  };
  ALBUMS.forEach((a) => {
    if (typeOf(a) === "studio" || typeOf(a) === "soundtrack") return;
    a.tracks.forEach((t) => {
      const origin = ALBUMS.find((o) => o !== a && (typeOf(o) === "studio" || typeOf(o) === "soundtrack") && o.tracks.some((x) => sameTitle(x.title, t.title)));
      if (!origin) return;
      const src = origin.tracks.find((x) => sameTitle(x.title, t.title));
      if (!t.from) t.from = origin.title;
      if (!t.note && src.note) t.note = src.note;
      if (t.writers === (a.writers || DEFAULT_WRITERS) && src.writers !== DEFAULT_WRITERS) t.writers = src.writers;
    });
  });

  function coverHTML(a) {
    const [c1, c2, c3] = a.palette;
    if (a.cover) {
      return `<div class="cover" style="background-image:url('${esc(a.cover)}')" role="img" aria-label="${esc(a.title)} cover"></div>`;
    }
    const badge = typeOf(a) === "studio" ? "" : `<span class="g-badge">${esc(typeInfo(a).one)}</span>`;
    return `<div class="cover gen t-${typeOf(a)}" style="--c1:${c1};--c2:${c2};--c3:${c3}" aria-hidden="true">
      <span class="g-year">${a.year}</span>${badge}
      <span class="g-artist">${esc(a.artist || "Elton John")}</span>
      <span class="g-title">${esc(a.title)}</span>
    </div>`;
  }

  function matchingSongs(a) {
    if (!query) return [];
    return a.tracks.filter((t) => norm(t.title).includes(query));
  }

  function cardHTML(a) {
    const hits = matchingSongs(a);
    const matchLine = hits.length
      ? `<span class="match">♪ ${esc(hits.slice(0, 2).map((t) => t.title).join(", "))}${hits.length > 2 ? "…" : ""}</span>`
      : "";
    return `<button class="album" data-id="${a.id}" aria-label="Open ${esc(a.title)} (${a.year})">
      <div class="sleeve">
        <div class="vinyl" style="--label:${a.palette[1]}"></div>
        ${coverHTML(a)}
      </div>
      <div class="caption"><strong>${esc(a.title)}</strong><span>${a.year} · ${a.tracks.length} songs</span>${matchLine}</div>
    </button>`;
  }

  function render() {
    const list = ALBUMS.filter((a) => {
      if (kind !== "all" && typeOf(a) !== kind) return false;
      if (era !== "all" && Math.floor(a.year / 10) * 10 !== +era) return false;
      if (!query) return true;
      return norm(a.title).includes(query) || matchingSongs(a).length;
    });

    grid.innerHTML = TYPES.map((t) => {
      const items = list.filter((a) => typeOf(a) === t.id);
      if (!items.length) return "";
      return `<section class="shelf" aria-labelledby="h-${t.id}">
        <h2 class="shelf-title" id="h-${t.id}">${t.label} <span>${items.length}</span></h2>
        <div class="album-grid">${items.map(cardHTML).join("")}</div>
      </section>`;
    }).join("");

    countEl.textContent = list.length
      ? `${list.length} album${list.length === 1 ? "" : "s"}`
      : "No albums match — try another search or filter.";
  }

  function openAlbum(id, songIndex) {
    const a = ALBUMS.find((x) => x.id === id);
    if (!a) return;
    current = a;
    if (overlay.hidden) lastFocus = document.activeElement;

    $("#panelCover").outerHTML = coverHTML(a).replace('class="cover', 'id="panelCover" class="cover big');
    $("#albumTitle").textContent = a.title;
    const kindLabel = typeOf(a) === "studio" ? "" : typeInfo(a).one + " · ";
    $("#albumMeta").textContent = `${kindLabel}${a.artist ? a.artist + " · " : ""}${a.year} · Produced by ${a.producer}`;
    $("#albumAbout").textContent = a.about;

    tracksEl.innerHTML = a.tracks
      .map((t, i) => {
        const hit = query && norm(t.title).includes(query) ? "hit" : "";
        return `<li><button data-i="${i}" class="${hit}" style="animation-delay:${i * 25}ms">
          <span>${esc(t.title)}</span>${t.note ? '<span class="star" title="Has a story">★</span>' : ""}
        </button></li>`;
      })
      .join("");
    tracksEl.scrollTop = 0;
    overlay.querySelector(".panel").scrollTop = 0;

    overlay.hidden = false;
    document.body.style.overflow = "hidden";

    // Auto-select a requested or searched song, otherwise show the prompt
    const firstHit = a.tracks.findIndex((t) => query && norm(t.title).includes(query));
    const pick = songIndex ?? (firstHit >= 0 ? firstHit : null);
    if (pick != null) showSong(pick);
    else
      songInfo.innerHTML = `<div class="empty"><div class="disc"></div>Pick a song to see its story.<br><small>★ = notable track</small></div>`;

    history.replaceState(null, "", `#${a.id}`);
    if (pick == null) $("#close").focus();
  }

  function showSong(i) {
    const a = current;
    const t = a.tracks[i];
    if (!t) return;
    tracksEl.querySelectorAll("button").forEach((b) => b.classList.toggle("active", +b.dataset.i === i));

    const note = t.note
      ? `<p class="note">${esc(t.note)}</p>`
      : `<p class="note plain">Track ${t.n} of ${a.tracks.length} on <em>${esc(a.title)}</em>. ${esc(albumContext(a))}</p>`;
    const yt = `https://www.youtube.com/results?search_query=${encodeURIComponent(`Elton John ${t.title}`)}`;

    // "Originally on" — link to the source album when it's on this page
    let fromRow = "";
    if (t.from) {
      const src = byTitle(t.from);
      fromRow = `<dt>Originally on</dt><dd>${
        src && src !== a
          ? `<button class="link" data-goto="${src.id}" data-song="${esc(t.title)}">${esc(src.title)} (${src.year}) →</button>`
          : esc(t.from)
      }</dd>`;
    }

    songInfo.innerHTML = `
      <div class="tnum">Track ${String(t.n).padStart(2, "0")}</div>
      <h4>${esc(t.title)}</h4>
      <dl>
        <dt>Album</dt><dd>${esc(a.title)}</dd>
        <dt>Year</dt><dd>${a.year}</dd>
        ${fromRow}
        <dt>Written by</dt><dd>${esc(t.writers)}</dd>
        <dt>Producer</dt><dd>${esc(a.producer)}</dd>
      </dl>
      ${note}
      <div class="actions">
        <a class="btn primary" href="${yt}" target="_blank" rel="noopener">▶ Listen</a>
        <button class="btn" data-step="-1" ${i === 0 ? "disabled" : ""}>← Prev</button>
        <button class="btn" data-step="1" ${i === a.tracks.length - 1 ? "disabled" : ""}>Next →</button>
      </div>`;

    if (window.matchMedia("(max-width: 1000px)").matches) {
      songInfo.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function albumContext(a) {
    const d = Math.floor(a.year / 10) * 10;
    return `From Elton's ${d === 1960 ? "earliest days" : d + "s era"}.`;
  }

  function closeAlbum() {
    overlay.hidden = true;
    document.body.style.overflow = "";
    current = null;
    history.replaceState(null, "", location.pathname + location.search);
    if (lastFocus) lastFocus.focus();
  }

  // ---- Events ----
  grid.addEventListener("click", (e) => {
    const card = e.target.closest(".album");
    if (card) openAlbum(card.dataset.id);
  });

  tracksEl.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-i]");
    if (b) showSong(+b.dataset.i);
  });

  songInfo.addEventListener("click", (e) => {
    const go = e.target.closest("button[data-goto]");
    if (go) {
      const target = ALBUMS.find((x) => x.id === go.dataset.goto);
      const idx = target.tracks.findIndex((t) => sameTitle(t.title, go.dataset.song));
      openAlbum(target.id, idx >= 0 ? idx : undefined);
      return;
    }
    const b = e.target.closest("button[data-step]");
    if (!b) return;
    const active = tracksEl.querySelector("button.active");
    const i = (active ? +active.dataset.i : 0) + +b.dataset.step;
    showSong(i);
    tracksEl.querySelector(`button[data-i="${i}"]`)?.focus({ preventScroll: true });
  });

  $("#close").addEventListener("click", closeAlbum);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeAlbum(); });

  document.addEventListener("keydown", (e) => {
    if (overlay.hidden) return;
    if (e.key === "Escape") closeAlbum();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (document.activeElement === searchEl) return;
      e.preventDefault();
      const active = tracksEl.querySelector("button.active");
      let i = active ? +active.dataset.i + (e.key === "ArrowDown" ? 1 : -1) : 0;
      i = Math.max(0, Math.min(current.tracks.length - 1, i));
      showSong(i);
      tracksEl.querySelector(`button[data-i="${i}"]`)?.focus({ preventScroll: false });
    }
  });

  searchEl.addEventListener("input", () => {
    query = norm(searchEl.value.trim());
    render();
  });

  function chipGroup(selector, attr, set) {
    const chips = document.querySelectorAll(selector);
    chips.forEach((c) =>
      c.addEventListener("click", () => {
        chips.forEach((x) => x.classList.remove("active"));
        c.classList.add("active");
        set(c.dataset[attr]);
        render();
      })
    );
  }
  chipGroup(".eras .chip", "era", (v) => (era = v));
  chipGroup(".kinds .chip", "kind", (v) => (kind = v));

  render();
  // Deep link support: page.html#gybr opens that album
  if (location.hash) openAlbum(location.hash.slice(1));
})();
