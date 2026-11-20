(() => {
  const $ = (s) => document.querySelector(s);
  const grid = $("#grid");
  const overlay = $("#overlay");
  const tracksEl = $("#tracks");
  const songInfo = $("#songInfo");
  const searchEl = $("#search");
  const countEl = $("#count");

  let era = "all";
  let query = "";
  let current = null; // current album
  let lastFocus = null;

  // Normalise tracks into objects
  ALBUMS.forEach((a) => {
    a.tracks = a.tracks.map((t, i) => {
      const [title, note, writers] = Array.isArray(t) ? t : [t];
      return { n: i + 1, title, note: note || "", writers: writers || a.writers || DEFAULT_WRITERS };
    });
  });

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  function coverHTML(a) {
    const [c1, c2, c3] = a.palette;
    if (a.cover) {
      return `<div class="cover" style="background-image:url('${esc(a.cover)}')" role="img" aria-label="${esc(a.title)} cover"></div>`;
    }
    return `<div class="cover gen" style="--c1:${c1};--c2:${c2};--c3:${c3}" aria-hidden="true">
      <span class="g-year">${a.year}</span>
      <span class="g-artist">Elton John</span>
      <span class="g-title">${esc(a.title)}</span>
    </div>`;
  }

  function matchingSongs(a) {
    if (!query) return [];
    return a.tracks.filter((t) => norm(t.title).includes(query));
  }

  function render() {
    const list = ALBUMS.filter((a) => {
      if (era !== "all") {
        const d = Math.floor(a.year / 10) * 10;
        if (era === "2000" ? d < 2000 : d !== +era) return false;
      }
      if (!query) return true;
      return norm(a.title).includes(query) || matchingSongs(a).length;
    });

    grid.innerHTML = list
      .map((a) => {
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
      })
      .join("");

    countEl.textContent = list.length
      ? `${list.length} album${list.length === 1 ? "" : "s"}`
      : "No albums match — try another search.";
  }

  function openAlbum(id, songIndex) {
    const a = ALBUMS.find((x) => x.id === id);
    if (!a) return;
    current = a;
    lastFocus = document.activeElement;

    $("#panelCover").outerHTML = coverHTML(a).replace('class="cover', 'id="panelCover" class="cover big');
    $("#albumTitle").textContent = a.title;
    $("#albumMeta").textContent = `${a.year} · Produced by ${a.producer}`;
    $("#albumAbout").textContent = a.about;

    tracksEl.innerHTML = a.tracks
      .map((t, i) => {
        const hit = query && norm(t.title).includes(query) ? " hit" : "";
        return `<li><button data-i="${i}" class="${hit.trim()}" style="animation-delay:${i * 30}ms">
          <span>${esc(t.title)}</span>${t.note ? '<span class="star" title="Has a story">★</span>' : ""}
        </button></li>`;
      })
      .join("");

    overlay.hidden = false;
    document.body.style.overflow = "hidden";

    // Auto-select a searched song, otherwise show the prompt
    const firstHit = a.tracks.findIndex((t) => query && norm(t.title).includes(query));
    const pick = songIndex ?? (firstHit >= 0 ? firstHit : null);
    if (pick != null) showSong(pick);
    else
      songInfo.innerHTML = `<div class="empty"><div class="disc"></div>Pick a song to see its story.<br><small>★ = notable track</small></div>`;

    history.replaceState(null, "", `#${a.id}`);
    $("#close").focus();
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

    songInfo.innerHTML = `
      <div class="tnum">Track ${String(t.n).padStart(2, "0")}</div>
      <h4>${esc(t.title)}</h4>
      <dl>
        <dt>Album</dt><dd>${esc(a.title)}</dd>
        <dt>Year</dt><dd>${a.year}</dd>
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
    return `Recorded during Elton's ${d === 1960 ? "earliest days" : d + "s era"}.`;
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

  document.querySelectorAll(".chip").forEach((c) =>
    c.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((x) => x.classList.remove("active"));
      c.classList.add("active");
      era = c.dataset.era;
      render();
    })
  );

  render();
  // Deep link support: page.html#gybr opens that album
  if (location.hash) openAlbum(location.hash.slice(1));
})();
