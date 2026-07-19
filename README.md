# CLIM-CALC — Calculateur de dimensionnement climatisation réversible

Calculateur web autonome pour estimer la puissance frigorifique et calorifique nécessaire pour climatiser/chauffer un logement, et déterminer le nombre de splits recommandés.

## Fonctionnalités

- **Multi-niveaux** : gestion plain-pied, duplex, triplex avec matériaux et isolations différents par niveau
- **Fenêtres de toit (Velux)** : prise en compte des apports solaires avec distinction volet extérieur / store intérieur
- **Toiture conditionnelle** : calcul adapté selon présence/absence de toiture
- **Cohérence questionnaire** : pas de redondance, chaque info saisie une seule fois
- **Calcul chaud et froid** : dimensionnement pour climatisation réversible
- **Stratégie de splits** : recommandation par défaut + alternatives selon configuration (ex: 1 split en duplex si escalier ouvert)
- **Export PDF** : génération d'un rapport imprimable avec tous les paramètres et résultats

## Utilisation

```bash
# Ouvrir directement dans un navigateur
xdg-open index.html

# Ou servir via un serveur HTTP (recommandé)
python3 -m http.server 8765 --bind 0.0.0.0
# Puis ouvrir http://localhost:8765
```

1. Renseigner la configuration globale (surface, hauteur, type de logement, mitoyenneté)
2. Pour chaque niveau, indiquer le matériau dominant et l'isolation des murs
3. Si applicable, préciser la situation de toiture et les fenêtres de toit
4. Renseigner l'exposition, les ouvertures, le type de vitrage
5. Indiquer l'occupation et les températures cibles (froid et chaud)
6. Cliquer "Calculer la puissance et les splits"
7. Optionnellement exporter le résultat en PDF

## Architecture

- `index.html` : structure et formulaire
- `app.js` : moteur de calcul et logique d'affichage
- `style.css` : mise en forme + styles d'impression PDF

## Méthode de calcul

Le calcul utilise des coefficients empiriques basés sur :
- Surface et volume des niveaux
- Coefficients d'isolation par matériau et isolation
- Apports internes (occupants, appareils)
- Apports solaires (exposition, vitrage, Velux)
- Pertes/gains par mitoyenneté, toiture, ventilation

Les formules sont des approximations destinées à donner un ordre de grandeur pour le dimensionnement initial.

---

## ⚠️ AVERTISSEMENT IMPORTANT

**Ce calculateur fournit une estimation INDICATIVE uniquement.**

Les résultats ne constituent PAS :
- Une étude thermique réglementaire (RT2012, RE2020)
- Un dimensionnement guaranteed pour installation professionnelle
- Une substitution à l'expertise d'un thermicien ou frigoriste qualifié

**Facteurs non pris en compte ou simplifiés :**
- Inertie thermique des parois
- Ponts thermiques spécifiques
- Étanchéité à l'air (test Blower Door)
- Déperditions par renouvellement d'air hygroscopique
- Apports solaires dynamiques (masques lointains, albédo)
- Rendement réel des équipements en conditions variables
- Régulation et intermittence d'usage

**Pour une installation réelle :**
1. Faire réaliser une étude thermique complète par un professionnel
2. Consulter un installateur qualifié (QualiPAC, RGE)
3. Vérifier la conformité avec les normes en vigueur
4. Dimensionner avec une marge de sécurité adaptée au climat local

L'auteur décline toute responsabilité quant à l'usage fait de ces estimations.

---

## Licence

Usage libre. Aucune garantie.

## Contact / Questions

Projet développé par Vincent pour estimation personnelle de dimensionnement climatisation.
