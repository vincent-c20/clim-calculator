(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  // COEFFICIENTS DE BASE
  // ═══════════════════════════════════════════════════════════════
  const COEF_FROID_BASE = 0.070; // kW/m² — base froid
  const COEF_CHAUD_BASE = 0.060; // kW/m² — base chaud
  const COEF_VOLUME     = 0.012; // kW/m³ — correction hauteur
  const CHARGE_PERSONNE = 0.080; // kW/personne (froid) — environ 80W (2× latent+sensible)
  const CHAUD_PERSONNE  = 0.050; // kW/personne (chaud)

  // ═══════════════════════════════════════════════════════════════
  // MATÉRIAUX DE MUR (par niveau) — coefficient isolé + isolation par défaut
  // On évite de redemander l'isolation globale : matériau ET isolation sont demandés
  // ensemble, mais l'isolation est pré-remplie selon le matériau (modifiable).
  // ═══════════════════════════════════════════════════════════════
  const MATERIAUX = {
    'ossature_bois':     { label: 'Ossature bois isolée',              defautIsolation: 'ite_recente', warningAucune: true },
    'btb_iso':           { label: 'Brique/parpaing + ITE récente',     defautIsolation: 'ite',         warningAucune: false },
    'beton_iti':         { label: 'Béton + ITI récente',               defautIsolation: 'iti_recente', warningAucune: true },
    'btb_non_iso':       { label: 'Brique/parpaing non isolé',         defautIsolation: 'aucune',      warningAucune: false },
    'brique_pleine':     { label: 'Brique pleine non isolée',          defautIsolation: 'aucune',      warningAucune: false },
    'pierre':            { label: 'Pierre ancienne (40–60 cm)',        defautIsolation: 'aucune',      warningAucune: true },
    'pierre_60':         { label: 'Pierre épaisse (> 60 cm, massive)', defautIsolation: 'aucune',      warningAucune: false }
  };

  const ISOLATIONS = {
    'aucune':      { label: 'Aucune isolation',                                coefFroid: 0.10, coefChaud: 0.12 },
    'iti_ancienne':{ label: 'Isolation intérieure légère / ancienne (<60mm)', coefFroid: 0.05, coefChaud: 0.06 },
    'iti_recente': { label: 'Isolation intérieure récente (ITI ≥ 80 mm)',     coefFroid: 0.02, coefChaud: 0.025 },
    'ite':         { label: 'Isolation extérieure (ITE)',                      coefFroid: -0.01, coefChaud: -0.01 },
    'ite_recente': { label: 'ITE récente + épaisse (≥ 140 mm)',               coefFroid: -0.03, coefChaud: -0.03 }
  };

  // ═══════════════════════════════════════════════════════════════
  // NIVEAUX — définition par type de logement
  // ═══════════════════════════════════════════════════════════════
  const NIVEAUX_SCHEMA = {
    'plainpied':    [{ key: 'unique', label: 'Niveau unique', ratioDefaut: 1.0 }],
    'etage_inter':  [{ key: 'unique', label: 'Niveau (étage immeuble)', ratioDefaut: 1.0 }],
    'duplex':       [
                       { key: 'rdc',    label: 'Rez-de-chaussée', ratioDefaut: 0.55 },
                       { key: 'etage',  label: 'Étage',           ratioDefaut: 0.45 }
                     ],
    'triplex':      [
                       { key: 'n1', label: 'Niveau 1 (RDC si plain-pied)', ratioDefaut: 0.40 },
                       { key: 'n2', label: 'Niveau 2 (étage)',              ratioDefaut: 0.35 },
                       { key: 'n3', label: 'Niveau 3 (dernier)',            ratioDefaut: 0.25 }
                     ]
  };

  // ═══════════════════════════════════════════════════════════════
  // TOITURE — coefficients (ajustent l'isolation globale selon toiture)
  // Les coeffs ici SONT l'impact ; ils s'ajoutent dans le multiplicateur
  // uniquement si le dernier niveau climatisé est sous toiture.
  // ═══════════════════════════════════════════════════════════════
  const TOITURE_COEFS = {
    'pas_toit':  { coef: 0,    detailsVisible: false },
    'toit_iso':  { coef: -0.02, detailsVisible: true  },
    'toit_moyen':{ coef: 0.02,  detailsVisible: true  },
    'toit_faible':{ coef: 0.06, detailsVisible: true  }
  };

  // ═══════════════════════════════════════════════════════════════
  // FENÊTRES DE TOIT — surface selon taille, coefficients d'occultation
  // ═══════════════════════════════════════════════════════════════
  const VELUX_SURFACES = {
    '0':     0,
    'petit': 0.5,
    'moyen': 0.8,
    'grand': 1.4
  };

  const VELUX_ORIENTATION_COEF = {
    'nord_ouest': 0.6,
    'est':        1.0,
    'sud':        1.3,
    'ouest':      1.2
  };

  // Puissance frigorifique supplémentaire pour 1 m² de velux (W/m²)
  // Base 300W/m² (incidence perpendiculaire en été) × orientation × occultation
  function veluxSurchargeFroid(type, nombre, voletExt, storeInt, orientation) {
    if (type === '0' || !nombre) return 0;
    const surfUnit = VELUX_SURFACES[type] || 0;
    const surfTotale = surfUnit * nombre;
    const coefOrient = VELUX_ORIENTATION_COEF[orientation] || 1.0;

    // Volet extérieur : réduit de 80%
    let coefOcc = 1.0;
    if (voletExt === 'oui') coefOcc *= 0.20;
    // Store intérieur : réduction additionnelle selon type
    switch (storeInt) {
      case 'aucun':      coefOcc *= 1.0;  break;
      case 'voilage':    coefOcc *= 0.85; break;
      case 'store':      coefOcc *= 0.55; break;
      case 'rideau_epais': coefOcc *= 0.40; break;
    }
    // Puissance = 300 W/m² * surf * orientation * occultation
    return (300 * surfTotale * coefOrient * coefOcc) / 1000; // kW
  }

  // ═══════════════════════════════════════════════════════════════
  // GESTION UI — génération des blocs par niveau
  // ═══════════════════════════════════════════════════════════════
  const form = document.getElementById('climForm');
  const containerNiveaux = document.getElementById('niveauxContainer');
  const sectionToiture = document.getElementById('sectionToiture');
  const toitureDetails = document.getElementById('toitureDetails');
  const veluxPanel = document.getElementById('veluxPanel');
  const veluxDetails = document.getElementById('veluxDetails');

  const getFloat = (id) => parseFloat(document.getElementById(id).value) || 0;
  const getInt = (id) => parseInt(document.getElementById(id).value, 10) || 0;
  const getVal = (id) => document.getElementById(id).value;

  // Génère les blocs de niveau en fonction du type de logement
  function genererBlocsNiveaux() {
    const type = getVal('typeLogement');
    const schema = NIVEAUX_SCHEMA[type];
    const totalSurface = getFloat('surface') || 1;

    containerNiveaux.innerHTML = '';
    schema.forEach((niv, idx) => {
      const surfaceNiv = Math.round((niv.ratioDefaut * totalSurface) * 10) / 10;
      const matValues = Object.entries(MATERIAUX).map(
        ([k, v]) => `<option value="${k}"${k===v.defautIsolation?'':''}>${v.label}</option>`
      ).join('');
      // Correction: le defautIsolation est le KEY du matériau ? Non: c'est le KEY de l'isolation.
      // On utilise le premier matériau par défaut (ossature_bois pour immeuble, pierre pour maison)
      const matDefaut = (type === 'etage_inter' || type === 'plainpied')
        ? 'beton_iti'
        : (idx === 0 ? 'pierre' : 'ossature_bois');

      const optionsMat = Object.entries(MATERIAUX).map(([k, v]) => {
        const selected = k === matDefaut ? ' selected' : '';
        return `<option value="${k}"${selected}>${v.label}</option>`;
      }).join('');

      const optionsIso = Object.entries(ISOLATIONS).map(([k, v]) => {
        const matKey = matDefaut;
        const isoDefaut = MATERIAUX[matKey].defautIsolation;
        const selected = k === isoDefaut ? ' selected' : '';
        return `<option value="${k}"${selected}>${v.label}</option>`;
      }).join('');

      const bloc = document.createElement('div');
      bloc.className = 'niveau-block';
      bloc.dataset.key = niv.key;
      bloc.innerHTML = `
        <h3>${niv.label}</h3>
        <div class="field-row">
          <label for="surf_${niv.key}">Surface du niveau (m²)</label>
          <input type="number" id="surf_${niv.key}" min="0" step="0.1" value="${surfaceNiv}">
        </div>
        <div class="field-row">
          <label for="mat_${niv.key}">Matériau dominant</label>
          <select id="mat_${niv.key}" class="select-mat">
            ${optionsMat}
          </select>
        </div>
        <div class="field-row">
          <label for="iso_${niv.key}">Isolation des murs</label>
          <select id="iso_${niv.key}" class="select-iso">
            ${optionsIso}
          </select>
        </div>
        <div class="hint-red field-coherence" style="display:none;"></div>
      `;
      containerNiveaux.appendChild(bloc);

      // Attacher la cohérence matériau ↔ isolation
      const selMat = bloc.querySelector('.select-mat');
      const selIso = bloc.querySelector('.select-iso');
      const hintCoherence = bloc.querySelector('.field-coherence');
      selMat.addEventListener('change', () => {
        const mat = MATERIAUX[selMat.value];
        if (mat) {
          const isoDefaut = mat.defautIsolation;
          selIso.value = isoDefaut;
          // Alerter si matériau massif + isolation épaisse = peu probable
          if (mat.warningAucune && selIso.value === 'aucune') {
            hintCoherence.textContent = '⚠ Ce matériau très peu isolant majore fortement le besoin. Vérifiez.';
            hintCoherence.style.display = 'block';
          } else {
            hintCoherence.style.display = 'none';
          }
        }
      });
      selIso.addEventListener('change', () => {
        const mat = MATERIAUX[selMat.value];
        if (mat && mat.warningAucune && selIso.value === 'aucune') {
          hintCoherence.textContent = '⚠ Combinaison peu fréquente : ossature bois sans isolation ? Assurez-vous.';
          hintCoherence.style.display = 'block';
        } else {
          hintCoherence.style.display = 'none';
        }
      });
    });

    // Recalculer quand la surface totale change
    document.querySelectorAll('#climForm input, #climForm select').forEach(el => {
      el.addEventListener('change', updateSurfaceNiveaux);
    });
    updateSurfaceNiveaux();
  }

  // Répartit la surface totale entre les niveaux si l'utilisateur modifie la surface totale
  let lastTotalSurface = 0;
  function updateSurfaceNiveaux() {
    const total = getFloat('surface') || 1;
    if (total === lastTotalSurface) return;
    const type = getVal('typeLogement');
    const schema = NIVEAUX_SCHEMA[type];
    schema.forEach(niv => {
      const inp = document.getElementById(`surf_${niv.key}`);
      if (inp) {
        const prev = parseFloat(inp.value) || 0;
        const ratio = lastTotalSurface > 0 ? prev / lastTotalSurface : niv.ratioDefaut;
        inp.value = Math.round(ratio * total * 10) / 10;
      }
    });
    lastTotalSurface = total;
  }

  // Masquer/afficher section toiture si "pas de toit"
  function updateToitureVisibility() {
    const v = getVal('toiture');
    const meta = TOITURE_COEFS[v];
    if (meta && !meta.detailsVisible) {
      toitureDetails.classList.add('section-hidden');
    } else {
      toitureDetails.classList.remove('section-hidden');
    }
  }

  // Gérer visuel velux : afficher/cacher les sous-champs selon la sélection
  function updateVeluxVisibility() {
    const v = getVal('veluxOui');
    if (v === '0') {
      veluxDetails.classList.add('section-hidden');
    } else {
      veluxDetails.classList.remove('section-hidden');
    }
  }

  // Gérer visuel sectionToiture : cachée si pas de toiture
  function updateSectionToitureVisibility() {
    // L'etage_inter (appartement sous autre) => pas de toiture
    const type = getVal('typeLogement');
    if (type === 'etage_inter') {
      sectionToiture.classList.add('section-hidden');
      document.getElementById('toiture').value = 'pas_toit';
    } else {
      sectionToiture.classList.remove('section-hidden');
    }
    updateToitureVisibility();
  }

  // ═══════════════════════════════════════════════════════════════
  // CALCUL
  // ═══════════════════════════════════════════════════════════════
  function collecterDonneesParNiveau() {
    const type = getVal('typeLogement');
    const schema = NIVEAUX_SCHEMA[type];
    const niveaux = [];
    for (const niv of schema) {
      const mat = getVal(`mat_${niv.key}`);
      const iso = getVal(`iso_${niv.key}`);
      const surf = getFloat(`surf_${niv.key}`);
      const matMeta = MATERIAUX[mat] || {};
      const isoMeta = ISOLATIONS[iso] || {};
      niveaux.push({
        key: niv.key,
        label: niv.label,
        surface: surf,
        coefMat: isoMeta.coefFroid || 0, // en fait on utilise coefFroid/coefChaud
        matMeta,
        isoMeta
      });
    }
    return niveaux;
  }

  function calculerMultiplicateurGlobalFroid() {
    let m = 0;
    m += getFloat('mitoyennete');
    m += getFloat('exposition');
    m += getFloat('fenetres');
    m += getFloat('vitrage');
    m += getFloat('appareils');
    m += getFloat('ventilation');
    m += (getFloat('localite') - 1);
    const toitVal = getVal('toiture');
    if (TOITURE_COEFS[toitVal]) m += TOITURE_COEFS[toitVal].coef;
    const typeIsolantVal = parseFloat(document.getElementById('typeIsolant')?.value || 0);
    m += typeIsolantVal;
    const ep = getFloat('epaisseurIsolant');
    if (ep >= 300) m -= 0.04;
    else if (ep >= 200) m -= 0.02;
    else if (ep >= 100) m -= 0.01;
    return m;
  }

  function calculerMultiplicateurGlobalChaud() {
    // Pour le chaud c'est l'inverse : mitoyenneté réduit, ventilation augmente, etc.
    // On prend les mêmes facteurs mais pondérés légèrement différemment
    let m = 0;
    m += getFloat('mitoyennete') * 1.15; // pertes par les murs plus importantes en chaud (écart T plus grand)
    m += getFloat('fenetres') * 0.3;     // les fenêtres = pertes aussi en chaud
    m += getFloat('vitrage') * 1.2;
    m += getFloat('ventilation') * 1.3;
    // Exposition : un peu moins d'apports en hiver
    const expVal = getFloat('exposition');
    m -= expVal * 0.3; // l'exposition sud aide un peu en chaud
    const toitVal = getVal('toiture');
    if (TOITURE_COEFS[toitVal]) m += TOITURE_COEFS[toitVal].coef * 1.2; // déperditions toit en chaud
    return m;
  }

  function arrondir(kw) { return Math.ceil(kw * 4) / 4; }
  function kwToBtu(kw)  { return kw * 3412; }
  function formatBtu(kw){ return Math.round(kwToBtu(kw) / 1000) + ' 000 BTU/h'; }

  function calculer() {
    const surface = getFloat('surface');
    const hauteur = getFloat('hauteur');
    const nbOccupants = getInt('nbOccupants');
    const tempFroid = getFloat('tempFroid');
    const tempChaud = getFloat('tempChaud');
    const type = getVal('typeLogement');

    if (surface <= 0) {
      alert('Surface invalide.');
      return;
    }

    const volume = surface * hauteur;
    const niveaux = collecterDonneesParNiveau();
    const multiplicateurFroid = 1 + calculerMultiplicateurGlobalFroid();
    const multiplicateurChaud = 1 + calculerMultiplicateurGlobalChaud();
    const correctionHauteur = Math.max(0, (hauteur - 2.5) * COEF_VOLUME * surface);

    // Ajustement température froid (base 25°C — plus on descend, plus il faut)
    const ecartFroid = Math.max(-2, Math.min(3, 25 - tempFroid));
    const facteurTempFroid = 1 + ecartFroid * 0.03;

    // Ajustement température chaud (base 20°C — plus on monte, plus il faut)
    const ecartChaud = Math.max(-2, Math.min(4, tempChaud - 20));
    const facteurTempChaud = 1 + ecartChaud * 0.04;

    // Calcul par niveau
    let totalFroid = 0;
    let totalChaud = 0;
    const detailsNiveaux = [];

    for (const niv of niveaux) {
      const surfNiv = niv.surface;
      if (surfNiv <= 0) continue;

      // Coeffs matériau + isolation
      const coefFroidNiv = (niv.isoMeta.coefFroid || 0) + (niv.matMeta.coefIsolDefaut ? 0 : 0);
      const coefChaudNiv = (niv.isoMeta.coefChaud || 0);

      // Pour froid et chaud, on applique le multiplicateur global + le coefficient isolé de CE niveau
      // Le coefficient isolé de niveau est déjà compté dans isoMeta.coefFroid
      const multFroid = multiplicateurFroid + coefFroidNiv;
      const multChaud = multiplicateurChaud + coefChaudNiv;

      const froidNiv = arrondir(surfNiv * COEF_FROID_BASE * multFroid * facteurTempFroid
                                + correctionHauteur * (surfNiv / surface)
                                + CHARGE_PERSONNE * Math.max(0, nbOccupants - 2));
      const chaudNiv = arrondir(surfNiv * COEF_CHAUD_BASE * multChaud * facteurTempChaud
                                + correctionHauteur * (surfNiv / surface) * 1.1
                                + CHAUD_PERSONNE * Math.max(0, nbOccupants - 2));

      // Surcharge Velux (froid uniquement)
      let surchargeVelux = 0;
      if (niv.key === niveaux[niveaux.length - 1].key) {
        // Velux seulement sur le/dernier niveau (sous toiture)
        if (getVal('toiture') !== 'pas_toit') {
          surchargeVelux = veluxSurchargeFroid(
            getVal('veluxOui'),
            getInt('veluxNombre'),
            getVal('veluxVoletExterieur'),
            getVal('veluxStoreInterieur'),
            getVal('veluxOrientation')
          );
        }
      }
      const froidNivFinal = arrondir(froidNiv + surchargeVelux);

      totalFroid += froidNivFinal;
      totalChaud += chaudNiv;
      detailsNiveaux.push({
        label: niv.label,
        surface: surfNiv,
        froid: froidNivFinal,
        chaud: chaudNiv,
        materiau: niv.matMeta.label,
        isolation: niv.isoMeta.label,
        surchargeVelux
      });
    }

    totalFroid = arrondir(Math.max(2.0, totalFroid));
    totalChaud = arrondir(Math.max(1.5, totalChaud));

    // ═══════════════════════════════════════════════════════════════
    // STRATÉGIE DE SPLITS
    // ═══════════════════════════════════════════════════════════════
    // Par défaut, on raisonne par niveau : 1 split par niveau pour un confort homogène.
    // Pour DUPLEX : option 1 seul split si communication directe large (escalier ouvert, trémie large).
    // Pour PLAIN-PIED : 1 split généralement, 2 si surface > 70m² ou plusieurs pièces fermées.

    const nbNiveaux = niveaux.length;
    const options = [];

    // ─── Option "par défaut" ───
    let defautSplits = nbNiveaux;
    let defautPuissanceFroid = totalFroid;
    let defautPuissanceChaud = totalChaud;
    let defautRaison = `${nbNiveaux} split(s), ${nbNiveaux > 1 ? '1 par niveau' : 'pour le niveau unique'}.`;
    if (nbNiveaux === 1 && surface > 70) {
      defautSplits = 2;
      defautRaison = '2 splits répartis : surface > 70 m² en plain-pied, diffusion homogène.';
    }

    options.push({
      nom: `Recommandée — ${defautSplits} split(s)`,
      splits: defautSplits,
      froid: defautPuissanceFroid,
      chaud: defautPuissanceChaud,
      raison: defautRaison,
      estDefaut: true
    });

    // ─── Option "1 seul split" pour duplex (si communication ouverte) ───
    if (nbNiveaux === 2) {
      // Toujours proposer l'option 1 split avec conditions strictes
      options.push({
        nom: '1 seul split (à envisager)',
        splits: 1,
        froid: totalFroid * 1.05, // légère surpuissance : pertes de distribution entre étages
        chaud: totalChaud * 1.10,
        raison: 'Un seul split puissant (généralement au RDC). Nécessite impérativement :\n' +
                '  • Une communication ouverte large entre RDC et étage (trémie ≥ 1,5 m², escalier ouvert)\n' +
                '  • Pas de porte fermée entre les niveaux\n' +
                '  • Maison max 100 m² au total\n' +
                '  • Prévoir ~10% de surpuissance pour compenser la déperdition d\'air froid à l\'étage.\n' +
                'À éviter si chambres à l\'étage (confort sonore + température hétérogène la nuit).',
        estDefaut: false
      });
    }

    // ─── Option multi (1 par pièce) pour grand confort ───
    const nbPieces = getInt('nbPieces');
    if (nbPieces >= 3 && surface > 80) {
      options.push({
        nom: `Multi-split — 1 par pièce (${nbPieces} splits)`,
        splits: nbPieces,
        froid: totalFroid,
        chaud: totalChaud,
        raison: `${nbPieces} splits répartis dans chaque pièce : confort maximal, régulation indépendante.\n` +
                '  • Plus cher à l\'achat et à poser (plusieurs UI, tuyauterie)\n' +
                '  • Peut être remplacé par 1 multi-split (1 extérieur, plusieurs intérieurs)',
        estDefaut: false
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // AFFICHAGE
    // ═══════════════════════════════════════════════════════════════
    afficherResultats({
      volume,
      totalFroid,
      totalChaud,
      options,
      detailsNiveaux,
      tempFroid,
      tempChaud,
      nbOccupants
    });
  }

  function afficherResultats(data) {
    document.getElementById('volumeOut').textContent = data.volume.toFixed(1) + ' m³';
    document.getElementById('puissanceFroidOut').textContent = data.totalFroid.toFixed(2) + ' kW (' + formatBtu(data.totalFroid) + ')';
    document.getElementById('puissanceChaudOut').textContent = data.totalChaud.toFixed(2) + ' kW';
    document.getElementById('splitsOut').textContent = data.options[0].splits;

    // ── Recommandation principale (première option) ──
    const rec = data.options[0];
    const recEl = document.getElementById('recommandationOut');
    recEl.innerHTML = `
      <div style="background:#2ecc71; color:white; padding:14px; border-radius:6px; margin-bottom:12px;">
        <strong style="font-size:1.15em;">⭐ Recommandation : ${rec.nom}</strong><br>
        <span style="font-size:0.95em;">
          Froid : ${rec.froid.toFixed(1)} kW — Chaud : ${rec.chaud.toFixed(1)} kW
        </span>
      </div>
      <div style="margin-left:8px;">
        <pre style="white-space:pre-wrap; font-family:inherit; font-size:0.92em; margin:0;">${rec.raison}</pre>
      </div>
    `;

    // ── Alternatives ──
    const altEl = document.getElementById('configAlternatives');
    altEl.innerHTML = '';
    if (data.options.length > 1) {
      let html = '<h3 style="font-size:1em; margin-top:20px;">Alternatives / options</h3>';
      for (let i = 1; i < data.options.length; i++) {
        const opt = data.options[i];
        html += `
          <div style="border-left:3px solid #3498db; padding-left:12px; margin-bottom:12px;">
            <div style="font-weight:bold; color:#3498db;">${opt.nom}</div>
            <div style="font-size:0.9em; color:#666; margin-bottom:4px;">
              Froid : ${opt.froid.toFixed(1)} kW — Chaud : ${opt.chaud.toFixed(1)} kW
            </div>
            <pre style="white-space:pre-wrap; font-family:inherit; font-size:0.85em; margin:0;">${opt.raison}</pre>
          </div>
        `;
      }
      altEl.innerHTML = html;
    }

    // ── Détail par niveau ──
    const detEl = document.getElementById('detailNiveaux');
    let h = '<table class="zone-table" style="width:100%; border-collapse:collapse;">'
          + '<thead><tr><th>Niveau</th><th>Surface</th><th>Matériau</th><th>Isolation</th><th>Froid</th><th>Chaud</th><th>Velux</th></tr></thead><tbody>';
    for (const n of data.detailsNiveaux) {
      h += `<tr>
        <td>${n.label}</td>
        <td>${n.surface.toFixed(1)} m²</td>
        <td>${n.materiau}</td>
        <td>${n.isolation}</td>
        <td>${n.froid.toFixed(2)} kW</td>
        <td>${n.chaud.toFixed(2)} kW</td>
        <td>${n.surchargeVelux > 0 ? '+' + n.surchargeVelux.toFixed(2) + ' kW' : '—'}</td>
      </tr>`;
    }
    h += '</tbody></table>';
    detEl.innerHTML = h;

    // ── Températures cibles ──
    let oldNote = document.querySelector('.note-cibles');
    if (oldNote) oldNote.remove();
    const note = document.createElement('p');
    note.className = 'note-cibles';
    note.style.fontSize = '0.9em';
    note.style.color = '#555';
    note.textContent = `Cibles : froid ${data.tempFroid} °C, chaud ${data.tempChaud} °C — ${data.nbOccupants} occupant(s).`;
    recEl.insertAdjacentElement('afterend', note);

    // ── Conseils ──
    const consEl = document.getElementById('conseilsOut');
    const conseils = [];
    conseils.push('Dimensionner légèrement au-dessus du besoin calculé = marge de confort pour les canicules.');
    conseils.push('Privilégier des splits réversibles pour couvrir chauffage d\'appoint hors saison.');
    if (data.options.length > 1) {
      conseils.push('En duplex, l\'option 1 split unique est économique mais ne convient que si la circulation d\'air entre étages est libre et sans porte. À éviter dans une maison avec chambres à l\'étage en période de canicule.');
    }
    if (getVal('veluxOui') !== '0' && getVal('veluxVoletExterieur') === 'non') {
      conseils.push('Fenêtres de toit sans volet extérieur : prévoir impérativement un store intérieur occultant. L\'apport solaire vertical est 2× plus élevé qu\'une fenêtre classique. Un volet extérieur réduit les apports de 80% contre ~50% pour un store intérieur.');
    }
    if (getFloat('vitrage') >= 0.05) {
      conseils.push('Vitrage ancien / simple : envisager un remplacement en double vitrage ITR (isolant renforcé) pour réduire les besoins été comme hiver.');
    }
    const isoTotale = data.detailsNiveaux.reduce((s, n) => s + (n.isolation.toLowerCase().includes('aucune') ? 0.10 : 0), 0);
    if (isoTotale > 0) {
      conseils.push('Au moins un niveau est non isolé. Des travaux d\'isolation (même ITI) seraient rentabilisés rapidement et réduiraient la puissance à installer de 20–40%.');
    }
    consEl.innerHTML = conseils.map(c => `<li>${c}</li>`).join('');

    document.getElementById('result').classList.remove('hidden');
    document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ═══════════════════════════════════════════════════════════════
  // ÉVÉNEMENTS
  // ═══════════════════════════════════════════════════════════════
  document.getElementById('typeLogement').addEventListener('change', () => {
    genererBlocsNiveaux();
    updateSectionToitureVisibility();
  });
  document.getElementById('toiture').addEventListener('change', updateToitureVisibility);
  document.getElementById('veluxOui').addEventListener('change', updateVeluxVisibility);
  document.getElementById('surface').addEventListener('change', updateSurfaceNiveaux);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    calculer();
  });

  // ── Bouton d'export PDF ──
  const exportBtn2 = document.getElementById('exportBtn2');
  if (exportBtn2) exportBtn2.addEventListener('click', e => { e.preventDefault(); exporterPDF(); });

  // ═══════════════════════════════════════════════════════════════
  // EXPORT PDF — via window.print() avec transformation du DOM
  // ═══════════════════════════════════════════════════════════════
  function exporterPDF() {
    // Vérifier qu'il y a un résultat à imprimer
    const resultSection = document.getElementById('result');
    if (resultSection.classList.contains('hidden')) {
      alert('Veuillez d\'abord effectuer un calcul avant d\'exporter en PDF.');
      return;
    }

    // Sauvegarder l'état actuel
    const bodyOverflow = document.body.style.overflow;

    // Créer le contenu print-friendly
    const printArea = document.createElement('div');
    printArea.id = 'printArea';

    // 1) Header imprimable
    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });
    const heureStr = now.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });

    let html = `<div class="print-header">
      <h1>CLIM-CALC — Rapport de dimensionnement</h1>
      <p>Généré le ${dateStr} à ${heureStr}</p>
    </div>`;

    // 2) Collecter les réponses du formulaire, section par section
    html += '<div class="card"><h2>Paramètres du projet</h2>';
    html += printRow('Type de logement', getSelectText('typeLogement'));
    html += printRow('Surface habitable', getFloat('surface') + ' m²');
    html += printRow('Hauteur sous plafond', getVal('hauteur') + ' m');
    html += printRow('Nombre de pièces', getInt('nbPieces'));
    html += printRow('Mitoyenneté', getSelectText('mitoyennete'));
    html += printRow('Nombre d\'occupants', getInt('nbOccupants'));
    html += printRow('Température visée froid', getFloat('tempFroid') + ' °C');
    html += printRow('Température visée chaud', getFloat('tempChaud') + ' °C');
    html += printRow('Climat local', getSelectText('localite'));
    html += printRow('Charges internes', getSelectText('appareils'));
    html += printRow('Renouvellement d\'air', getSelectText('ventilation'));
    html += '</div>';

    // 3) Détails par niveau
    html += '<div class="card"><h2>Configuration par niveau</h2>';
    const type = getVal('typeLogement');
    const schema = NIVEAUX_SCHEMA[type];
    for (const niv of schema) {
      const mat = getVal(`mat_${niv.key}`);
      const iso = getVal(`iso_${niv.key}`);
      const surf = getFloat(`surf_${niv.key}`);
      html += printRow(`<strong>${niv.label}</strong>`, '');
      html += printRow('  Surface', surf.toFixed(1) + ' m²');
      html += printRow('  Matériau', MATERIAUX[mat]?.label || '?');
      html += printRow('  Isolation', ISOLATIONS[iso]?.label || '?');
    }
    html += '</div>';

    // 4) Toiture + Velux
    const toitVal = getVal('toiture');
    if (toitVal !== 'pas_toit') {
      html += '<div class="card"><h2>Toiture</h2>';
      html += printRow('Situation toiture', document.getElementById('toiture').selectedOptions[0]?.text || toitVal);
      html += printRow('Type d\'isolant', getSelectText('typeIsolant'));
      const ep = getFloat('epaisseurIsolant');
      if (ep > 0) html += printRow('Épaisseur isolant', ep + ' mm');

      const veluxType = getVal('veluxOui');
      if (veluxType !== '0') {
        html += printRow('Fenêtres de toit', document.getElementById('veluxOui').selectedOptions[0]?.text || veluxType);
        html += printRow('  Nombre', getInt('veluxNombre'));
        html += printRow('  Volet extérieur', getSelectText('veluxVoletExterieur'));
        html += printRow('  Store intérieur', getSelectText('veluxStoreInterieur'));
        html += printRow('  Orientation', getSelectText('veluxOrientation'));
      } else {
        html += printRow('Fenêtres de toit', 'Aucune');
      }
      html += '</div>';
    }

    // 5) Exposition et ouvertures
    html += '<div class="card"><h2>Exposition et ouvertures</h2>';
    html += printRow('Exposition solaire', getSelectText('exposition'));
    html += printRow('Surface vitrée', getSelectText('fenetres'));
    html += printRow('Type de vitrage', getSelectText('vitrage'));
    html += '</div>';

    // 6) Résultat — on le clone proprement
    html += resultSection.innerHTML;

    // 7) Footer
    html += `<div class="print-footer">
      CLIM-CALC — Estimation indicative. Ne remplace pas une étude thermique complète.<br>
      Document généré le ${dateStr} à ${heureStr}
    </div>`;

    printArea.innerHTML = html;

    // Cacher le contenu normal et insérer le printArea
    const container = document.querySelector('.container');
    const originalContent = container.innerHTML;
    container.innerHTML = '';
    container.appendChild(printArea);

    // Supprimer le hidden sur result dans le printArea pour qu'il s'affiche
    const resultInPrint = printArea.querySelector('#result');
    if (resultInPrint) resultInPrint.classList.remove('hidden');

    // Imprimer
    window.print();

    // Restaurer après l'impression (après un délai pour laisser le navigateur finir)
    setTimeout(() => {
      container.innerHTML = originalContent;
      // Réattacher les événements
      reattacherEvenements();
    }, 500);
  }

  function printRow(label, value) {
    return `<div class="print-row"><span class="p-label">${label}</span><span class="p-value">${value}</span></div>`;
  }

  function getSelectText(id) {
    const el = document.getElementById(id);
    if (!el) return '?';
    return el.options[el.selectedIndex]?.text || '?';
  }

  // Réattacher les événements après restauration du DOM
  function reattacherEvenements() {
    const btnExport2 = document.getElementById('exportBtn2');
    if (btnExport2) btnExport2.addEventListener('click', e => { e.preventDefault(); exporterPDF(); });

    document.getElementById('typeLogement')?.addEventListener('change', () => {
      genererBlocsNiveaux();
      updateSectionToitureVisibility();
    });
    document.getElementById('toiture')?.addEventListener('change', updateToitureVisibility);
    document.getElementById('veluxOui')?.addEventListener('change', updateVeluxVisibility);
    document.getElementById('surface')?.addEventListener('change', updateSurfaceNiveaux);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      calculer();
    });
  }

  // Initialisation
  genererBlocsNiveaux();
  updateSectionToitureVisibility();
  updateVeluxVisibility();
  lastTotalSurface = getFloat('surface') || 1;

})();
