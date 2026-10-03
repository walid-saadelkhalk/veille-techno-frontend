# Kanban Board, front React

Projet de **veille technologique front**, Master 1, La Plateforme. La veille comparait **Vue, Angular et React** ; React a été retenu, et ce dépôt est le terrain sur lequel ce choix est mis à l'épreuve.

**Le Kanban n'est pas le sujet.** C'est l'application qui permet de vérifier que les affirmations de la veille tiennent dans du code réel. Les fonctionnalités doivent marcher, pas impressionner.

L'application consomme l'API du **projet back jumeau**, un serveur NestJS avec PostgreSQL et authentification JWT. Les deux dépôts restent séparés.

---

## Sommaire

1. [Démarrer le projet](#1-démarrer-le-projet)
2. [Comptes de démonstration](#2-comptes-de-démonstration)
3. [Le projet back](#3-le-projet-back)
4. [Scripts disponibles](#4-scripts-disponibles)
5. [Architecture](#5-architecture)
6. [Les choix techniques, et ce qu'ils ont coûté](#6-les-choix-techniques-et-ce-quils-ont-coûté)
7. [Sécurité](#7-sécurité)
8. [Le changement de cap](#8-le-changement-de-cap)
9. [Limites connues](#9-limites-connues)
10. [Tests](#10-tests)
11. [Mesures](#11-mesures)
12. [Backlog et conduite de projet](#12-backlog-et-conduite-de-projet)
13. [Les décisions structurantes](#13-les-décisions-structurantes)
14. [Structure du dépôt](#14-structure-du-dépôt)

---

## 1. Démarrer le projet

**Toutes les commandes de cette section ont été exécutées**, sur macOS 27.0 avec Node v24.21.0 et npm 11.19.0.

Lancer ce front ne se résume pas à `npm run dev` : il lui faut une base, une API et des comptes.

### Étape 1, PostgreSQL

PostgreSQL 17 doit écouter sur le port **5432**. Sur la machine de développement il tourne via Homebrew et démarre au boot. Pour vérifier qu'il écoute :

```sh
lsof -nP -iTCP:5432 -sTCP:LISTEN
```

> **Ne lancez pas `docker compose up` côté back.** Son `docker-compose.yml` déclare **son propre PostgreSQL sur le même port 5432, avec un volume différent**. Soit le port est pris et le conteneur échoue, soit il sert une base vide et l'application paraît cassée alors qu'elle fonctionne.

### Étape 2, l'API du back

Depuis le dossier du projet back, **pas depuis celui-ci** :

```sh
npm install
npm run start:dev
```

Avant de lancer, vérifiez qu'aucune instance ne tourne déjà. Une instance oubliée se comporte exactement comme une absence d'instance, jusqu'au message `EADDRINUSE` :

```sh
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

### Étape 3, semer la base

Toujours côté back :

```sh
npm run seed
```

### Étape 4, la configuration du front

```sh
cp .env.example .env.local
```

Le fichier contient une seule variable :

```
VITE_API_URL=http://localhost:3000/api
```

`.env.local` et `.env` sont tous deux ignorés par Git, `.env.example` ne l'est pas. **Si la variable est absente, vide, ou ne contient que des espaces, l'application affiche un message lisible à l'écran** plutôt qu'une page blanche.

### Étape 5, le front

```sh
npm install
npm run dev
```

L'application est sur **http://localhost:5173**.

---

## 2. Comptes de démonstration

Créés par le `npm run seed` du back. **Ils vivent dans ce fichier et nulle part dans le code**, ce qui est vérifié par un contrôle de sécurité automatique.

| Email | Mot de passe | Rôle |
|---|---|---|
| `user1@example.com` | `motdepasse123` | utilisateur |
| `user2@example.com` | `motdepasse123` | utilisateur |
| `admin@example.com` | `motdepasse123` | administrateur |

Un administrateur ne peut être créé que par le seed.

**Le JWT dure une heure.** Au-delà, l'application vous ramène proprement à l'écran de connexion.

---

## 3. Le projet back

**https://github.com/walid-saadelkhalk/veille-techno-backend**

NestJS, Prisma, PostgreSQL, authentification JWT avec hachage Argon2id. 13 routes, 290 tests.

**Il n'est pas copié dans ce dépôt**, ni en dossier ni en sous-module. Les deux moitiés du produit restent deux dépôts, et c'est volontaire : le front doit pouvoir être lu, testé et jugé seul.

Le seul changement apporté au back pour ce projet est **l'activation du CORS**, avec une origine explicite.

---

## 4. Scripts disponibles

| Commande | Ce qu'elle fait |
|---|---|
| `npm run dev` | serveur de développement, port 5173 |
| `npm run build` | vérification de types puis build de production dans `dist/` |
| `npm run preview` | sert le build de production, pour mesurer dans des conditions réelles |
| `npm run test` | les 256 tests, une fois |
| `npm run test:watch` | les tests en surveillance |
| `npm run lint` | oxlint |

---

## 5. Architecture

### La règle qui porte tout le projet

**La logique métier vit dans `src/domain/`, qui n'importe jamais React.** Les composants affichent et appellent, ils ne calculent pas. La persistance est derrière une interface unique, et un seul fichier sait où sont rangées les données.

### Le schéma

```
            NAVIGATEUR                                    ║            SERVEUR
   tout ce qui suit est modifiable                        ║    la barriere est ICI
   par l'utilisateur, outils de dev compris               ║
                                                          ║
   main.tsx                                               ║
   le SEUL fichier qui lit import.meta.env                ║
        |                                                 ║
        v                                                 ║
   services.ts            LE POINT DE COMPOSITION         ║
   compose les quatre fabriques, UNE fois                 ║
        |                                                 ║
        v                                                 ║
   App.tsx                                                ║
   un seul useAuth, puis un rendu conditionnel            ║
   >> CONFORT D'INTERFACE, PAS UNE BARRIERE <<            ║
        |                                                 ║
        v                                                 ║
   components/                                            ║
   Board  Column  Card  CardEditor  LoginForm  TitleForm  ║
        |                      \                          ║
        | useBoard              \  appellent des          ║
        |                        \ fonctions PURES        ║
        v                         v                       ║
   hooks/                      domain/                    ║
   use-board.ts                operations.ts              ║
   board-reducer.ts            types.ts                   ║
        |                      >> AUCUN React <<          ║
        |                      >> AUCUN fetch  <<         ║
        | ne connait QUE                                  ║
        | l'interface                                     ║
        v                                                 ║
   storage/storage.ts                                     ║
   interface BoardStorage                                 ║
        |                                                 ║
        +---------------------------+                     ║
        v                           v                     ║
   api-storage.ts            memory-storage.ts            ║
   LES SEULES routes         le double, en RAM            ║
   du tableau                ZERO reseau                  ║
        |                                                 ║
        v                                                 ║
   api/http-client.ts                                     ║
   LE SEUL fetch du projet                                ║
        |                                                 ║
        |  HTTP + en-tete Authorization                   ║
        +-------------------------------------------------╫--> API NestJS
                                                          ║    JwtAuthGuard GLOBAL
                                                          ║    >> LA barriere <<
                                                          ║         |
                                                          ║         v
                                                          ║    PostgreSQL 17
```

### Combien de fichiers faudrait-il toucher pour changer de source de données

**Un seul, `src/services.ts`**, et une seule ligne :

```ts
boardStorage: createApiStorage(client)   // production
boardStorage: createMemoryStorage()      // tout tourne sans reseau
```

**Ce n'est pas une affirmation, c'est exécuté** : 33 tests montent l'application entière sur l'adaptateur mémoire, sans serveur ni base. Le hook ne s'aperçoit de rien.

### Les fichiers uniques

| Ce que personne d'autre ne sait | Fichier |
|---|---|
| appeler `fetch` | `src/api/http-client.ts` |
| les routes du tableau | `src/storage/api-storage.ts` |
| la route d'authentification | `src/api/auth-api.ts` |
| où vit le jeton | `src/auth/token-storage.ts` |
| lire l'environnement | `src/main.tsx` |
| la mise en forme | `src/index.css`, feuille unique |

Et symétriquement, `src/domain/` **n'importe rien d'autre que lui-même** : ni React, ni réseau.

### Le coût du chargement

`load()` fait **1 + N requêtes** : une pour les colonnes, puis une par colonne pour ses cartes. Il n'existe pas de `GET /api/cards` global, donc **c'est la forme de l'API qui dicte le coût**. Les requêtes de cartes partent **ensemble**, donc le chargement coûte un aller-retour et non N. Trois tests figent ce comportement.

---

## 6. Les choix techniques, et ce qu'ils ont coûté

| Domaine | Choix | Pourquoi |
|---|---|---|
| Framework | **React 19.3.0** | sujet de la veille |
| Langage | **TypeScript 6.0.3**, strict, aucun `any` | le typage du modèle est la moitié de la conception |
| Outillage | **Vite 8.3.1** | SPA sans besoin de rendu serveur. Next.js écarté pour cette raison, Create React App n'est plus recommandé |
| État | **`useReducer` natif** | quatre états réseau et des transitions qui doivent rester cohérentes. **Aucune librairie d'état** |
| Réseau | **`fetch` natif**, enveloppé une fois | axios écarté : URL de base, JSON, en-tête d'autorisation et rejet sur statut tiennent en une centaine de lignes |
| Routage | **aucun** | 2 écrans après la coupe du périmètre, donc un rendu conditionnel suffit |
| Style | **CSS simple**, une feuille, **aucune librairie d'UI** | 3,15 ko écrits à la main |
| Tests | **Vitest 5.0.3**, `jsdom`, `@testing-library/react` | même outillage que le back, donc comparaison directe possible |
| Lint | **oxlint 1.86.0** | un binaire unique contre un arbre de dépendances |

### Le chiffre qui résume tout

**2 dépendances de production : `react` et `react-dom`.**

Brancher une API complète, avec authentification, erreurs typées et purge de session, **n'en a coûté aucune**, parce que `fetch` est natif.

### Les dépendances refusées, mesurées et non supposées

| Refusée | Ce qu'elle aurait coûté |
|---|---|
| **Tailwind** et son greffon Vite | **+14 paquets** sur 100. Zéro dépendance de production, puisqu'il compile vers du CSS. Le coût réel aurait été architectural : les classes utilitaires mettent la présentation dans le JSX |
| `@testing-library/jest-dom` | écarté : il aurait servi à rendre **trois assertions** plus jolies |
| `@testing-library/user-event` | écarté : deux champs et un bouton ne le justifient pas |
| `react-router-dom` | jamais installé, le routeur ayant été coupé |

**Honnêteté qui va contre l'argument** : Tailwind n'aurait ajouté aucune dépendance de production. Dire le contraire serait faux.

---

## 7. Sécurité

Les décisions ont été prises **avant la première ligne de code réseau**, puis vérifiées une par une : **31 points de contrôle, 27 vérifiés, 4 devenus sans objet, aucune faille**.

### Où vit le jeton, et pourquoi

Le JWT est rangé dans `localStorage`, derrière `src/auth/token-storage.ts`, **seul fichier autorisé à y toucher**. Ce n'est pas le choix le plus sûr, c'est un choix assumé :

- **`sessionStorage` n'aurait rien apporté.** Les deux sont lisibles par n'importe quel JavaScript de l'origine, l'exposition au XSS est **identique**, et seule la durée de vie change. Dire le contraire est une erreur répandue.
- La **mémoire React seule** était la seule option réellement plus sûre, et elle a été **écartée en connaissance de cause** : elle impose une reconnexion à chaque rechargement, ce qui casse le scénario qui prouve que les données sont dans PostgreSQL et non dans le navigateur.
- Un **cookie `httpOnly`** serait le bon choix. Il est hors d'atteinte : l'API ne l'émet pas.

Ce qui rend la limite tolérable est **vérifié, pas supposé** : `index.html` ne charge **aucun script distant**, il n'y a que 2 dépendances de production, et React échappe par défaut. La surface XSS se réduit à notre propre code.

### La frontière de confiance est le serveur

Il n'y a **aucune garde de sécurité côté client**. L'affichage du tableau tient à un rendu conditionnel, qui est du **confort d'interface**. Quelqu'un qui le forcerait obtiendrait un écran en erreur, parce que `GET /api/lists` répond 401 sans jeton valide : **la donnée ne quitte jamais le serveur**.

Cinq conséquences, toutes vérifiées :

1. aucune donnée sensible dans le bundle. Les variables `VITE_*` finissent **en clair** dans `dist/` par construction, donc seule `VITE_API_URL` y a sa place ;
2. aucune règle d'autorisation dupliquée côté client : on envoie la requête et on affiche la réponse ;
3. **401 et 403 ne sont pas traités pareil.** Le 401 veut dire « ta session est morte », donc purge et retour à la connexion. Le 403 veut dire « cette ressource n'est pas à toi », donc un message **sans déconnecter** ;
4. un serveur injoignable **ne déconnecte pas**, et renvoyer vers un formulaire de connexion serait absurde puisqu'il a besoin du même serveur ;
5. la déconnexion purge **le jeton et l'état React**. Le tableau étant monté dans la branche authentifiée, passer anonyme le démonte : **le démontage est la purge**.

### Les 8 limites assumées

Documentées plutôt que corrigées, parce que les corriger supposerait de modifier une API déjà livrée.

| Limite | Pourquoi elle n'est pas corrigée |
|---|---|
| Le jeton est lisible par tout JavaScript de l'origine | le cookie `httpOnly` exigerait de modifier l'API |
| Pas de jeton de rafraîchissement, session d'une heure | idem |
| Pas de rate limiting côté API | le back est livré, seul le CORS pouvait changer |
| Pas d'en-têtes de sécurité côté API | idem |
| Pas de CSP | elle se pose au niveau du serveur qui sert le build, et aucun hébergement n'est prévu |
| HTTP en local, pas HTTPS | développement local uniquement |
| Un JWT est **signé mais pas chiffré** | c'est son fonctionnement normal, pas un défaut |
| **Oracle d'existence sur un 403** : viser la ressource d'un autre renvoie « Cette liste appartient à un autre utilisateur. », ce qui révèle qu'elle existe | **non exploitable** : les identifiants sont des UUID v4, 122 bits aléatoires, donc non énumérables. La divulgation est réelle, son exploitation ne l'est pas |

**La dernière ligne est une correction.** La documentation de ce projet affirmait, de bonne foi, que l'API répondait « 404 avant 403 pour ne pas révéler l'existence d'une ressource d'autrui ». La mesure à deux comptes dit l'inverse. Elle est inscrite telle quelle plutôt que corrigée en silence.

---

## 8. Le changement de cap

Le 30 septembre, ce projet avait retenu **le `localStorage` seul**, l'API étant hors périmètre. **Le 1er octobre, cette décision a été inversée** : le Kanban consomme l'API du back, avec écran de connexion et JWT.

**Le motif est un changement de contrainte, pas une erreur d'analyse.** Les deux décisions ont été écrites et conservées, ADR-002 puis ADR-009 qui la remplace, **et l'ancienne n'a pas été effacée**.

**Ce que ça a coûté : rien**, parce que l'inversion a eu lieu **avant qu'une ligne de la couche de persistance soit écrite**. C'est le bénéfice concret d'avoir conçu avant de coder.

Une décision a survécu à l'inversion et une autre non. L'**asynchronisme** de l'interface de persistance était juste et a été conservé. Sa **granularité**, `load` plus `save`, ne survivait pas au contrat réel de l'API : aucune route n'enregistre un tableau entier. L'interface est donc devenue **une méthode par opération**.

---

## 9. Limites connues

En plus des 8 limites de sécurité :

**Servir cette application en production exige de réécrire les URL inconnues vers `index.html`.** C'est une SPA : sans cette réécriture, un lien profond renvoie un 404 du serveur. La question ne se pose pas en développement, où Vite s'en charge.

**L'API n'impose aucune longueur maximale sur les titres.** Un titre de 10 000 caractères est accepté. Le front ne la duplique pas, il se contente de ne pas casser l'affichage, ce qu'un test vérifie.

**Aucune mise à jour optimiste.** Chaque action attend la réponse du serveur, parce que le client ne peut pas deviner l'identifiant que la base va générer. Sur un réseau lent, cela se verrait.

**Le drag and drop n'est pas implémenté**, et c'est délibéré : il n'apparaît nulle part dans la consigne. C'est le piège de planning numéro un de ce sujet.

**Lighthouse n'a pas encore été passé.** La case reste vide plutôt que remplie d'un chiffre inventé.

---

## 10. Tests

```sh
npm run test
```

**256 tests, verts, en environ 1,3 seconde.**

| Couche | Régime |
|---|---|
| `src/domain/` | TDD strict. Fonctions pures, testées sans React ni réseau |
| `src/api/` et `src/storage/` | TDD strict, `fetch` remplacé par une fonction espionne |
| `src/auth/`, `src/hooks/`, composants | tests après conception, avec `jsdom` |

**Le DOM est demandé fichier par fichier, jamais globalement.** Neuf fichiers de test sur dix-neuf portent une directive `// @vitest-environment jsdom` en tête ; **les dix autres tournent en Node**, sans navigateur, et ce sont ceux du domaine, de la couche réseau, de la persistance et du réducteur.

Ce n'est pas qu'une question de vitesse : avec un environnement DOM global, **un `document` oublié dans `src/domain/` passerait les tests et casserait en production**. Avec la directive par fichier, il échoue là où il est écrit.

**Les tests de composants montent l'arbre entier sur l'adaptateur mémoire**, donc ils exercent `Board`, `Column`, `Card`, `TitleForm` et le vrai hook ensemble, sans serveur.

**Rapport : environ 1,5 ligne de test par ligne de source.**

Un cahier de **39 scénarios de bout en bout** complète ces tests. Il est joué à la main.

---

## 11. Mesures

Relevées le **2026-10-04** sur macOS 27.0, Node v24.21.0, **après le dernier commit de code**. Vite compte en kB de 1000 octets. Une mesure dont le code a changé est refaite et redatée, jamais recyclée.

| Fichier | Taille | Compressé |
|---|---|---|
| `dist/assets/index-*.js` | 232,51 kB | **72,40 kB** |
| `dist/assets/index-*.css` | 3,15 kB | 1,01 kB |
| `dist/index.html` | 0,39 kB | 0,26 kB |
| **Total** | **236,06 kB** | **73,67 kB** |

| Autre mesure | Valeur |
|---|---|
| Dépendances de production | **2** |
| Dépendances de développement | 10 |
| Arbre complet installé | 100 paquets, 119 Mo |
| Build | 60 ms pour Vite, 0,79 s avec la vérification de types |
| Démarrage du serveur de dev, à froid | 66 et 65 ms |
| Tests | **256 en 1,63 s** |

### Ce que pèse une fonctionnalité

| Après | JS | Delta |
|---|---|---|
| affichage du tableau | 227,73 kB | |
| ajouter une colonne et une tâche | 228,45 kB | **+0,72 kB** |
| modifier et supprimer une tâche | 229,89 kB | +1,44 kB |
| le CSS | 229,93 kB | +0,04 kB |
| renommer et supprimer une colonne | 232,14 kB | +2,21 kB |
| **déplacer une carte entre colonnes** | 232,51 kB | **+0,37 kB** |

**Les quatre fonctionnalités obligatoires de la consigne pèsent 2,16 kB**, soit environ 540 octets chacune. Une fois l'état réseau, la gestion d'erreur et l'interface de persistance en place, une fonctionnalité métier n'est plus qu'un appel et un formulaire.

**Et déplacer une carte entre colonnes a coûté 370 octets**, parce qu'aucun code de déplacement n'a été écrit : l'état étant plat, deux collections reliées par `listId`, le serveur renvoie la carte avec sa nouvelle colonne et elle est remplacée en place. Avec une forme imbriquée, il aurait fallu la retirer d'un tableau et l'ajouter à un autre sans la perdre entre les deux. **C'est une décision de modélisation du premier lot, chiffrée au dernier.**

### Comparaison avec le projet back

| | Front, 2026-10-03 | Back, **2026-09-27** |
|---|---|---|
| Dépendances de production | **2** | **17** |
| Poids livré | 236 kB, dont 74 kB compressés | 792 Ko de `dist` |
| Démarrage | 61 à 66 ms | 517 à 566 ms |

**L'écart 2 contre 17 doit être expliqué, pas brandi.** Un serveur porte l'ORM, la validation, l'authentification, le hachage et la documentation d'API ; un client n'en porte aucun. Ce sont deux métiers différents, et le présenter comme une victoire du front serait malhonnête. Ce qui est défendable, c'est que ce front n'a ajouté **aucune** dépendance là où beaucoup en auraient ajouté quatre : un client HTTP, une librairie d'état, une librairie d'UI et un routeur.

---

## 12. Backlog et conduite de projet

### Jira plutôt que GitHub Projects, et c'est un écart assumé

**Le guide de soutenance nomme explicitement GitHub Projects.** Ce projet a utilisé **Jira**, en continuité avec le projet back suivi sur le même outil. L'écart a été signalé le jour où il a été décidé, et non justifié après coup.

**38 tickets**, chacun avec une user story, des critères d'acceptation au format Given / When / Then, une priorité MoSCoW et **une estimation écrite avant de commencer**.

| Statut | Nombre |
|---|---|
| Terminé | 29 |
| En cours | 2 |
| À faire | 3 |
| Backlog, dont le lot coupé | 4 |

Deux tickets portent `[ANNULÉ]` et quatre appartiennent à un lot hors consigne, coupé quand le planning a glissé.

### Estimations contre temps réels

Le guide demande cette donnée. La voici, sur **17 points mesurés**, chaque estimation ayant été écrite **avant** le travail.

| Ticket | Estimé | Réel | Facteur |
|---|---|---|---|
| FRONT-4 | 30 min | 1 h | 2,00 |
| FRONT-5 et FRONT-6 | 1 h 15 | 35 min | 0,47 |
| FRONT-16 | 45 min | 15 min | 0,33 |
| FRONT-27 | 45 min | 30 min | 0,67 |
| FRONT-7 et FRONT-28 | 1 h 30 | 1 h | 0,67 |
| FRONT-29 | 1 h 30 | 45 min | 0,50 |
| FRONT-30 | 20 min | 1 h | **3,00** |
| FRONT-31 | 1 h | 1 h 15 | 1,25 |
| FRONT-32 | 55 min | 25 min | 0,45 |
| FRONT-10 | 2 h 15 | 30 min | 0,22 |
| FRONT-11 | 45 min | 30 min | 0,67 |
| FRONT-12 et FRONT-13 | 50 min | 10 min | 0,20 |
| FRONT-14 et FRONT-15 | 45 min | 10 min | 0,22 |
| FRONT-34 | 45 min | 30 min | 0,67 |
| FRONT-18 | 30 min | 1 h | **2,00** |
| FRONT-20 | 20 min | 5 min | 0,25 |
| FRONT-19 | 20 min | 5 min | 0,25 |
| **Cumul** | **15 h 00** | **9 h 45** | **0,65** |

**Le motif est plus utile que la moyenne** : les **deux seuls** facteurs au-dessus de 1 sont des tickets estimés à **30 minutes ou moins**. Tous ceux estimés à 45 minutes ou plus sont rentrés sous leur estimation.

**L'explication, et c'est l'enseignement principal de la conduite de ce projet** : le temps réel est **un coût fixe plus une part variable**. La méthode de travail, conception puis tests puis implémentation puis vérification, coûte une vingtaine de minutes quoi qu'il arrive. Ce coût disparaît dans un ticket de deux heures et triple un ticket de vingt minutes. **J'avais estimé la part variable seule.**

---

## 13. Les décisions structurantes

Le projet tient un journal de décisions, **26 entrées** au format décision, alternative écartée, raison. En voici les plus structurantes, celles qui expliquent pourquoi le code a cette forme.

| Décision | Alternative écartée | Raison |
|---|---|---|
| Consommer l'API du back | le `localStorage` seul | la contrainte a changé le lendemain du cadrage. Voir la section 8 |
| Interface de persistance **par opération** | `load` plus `save` | aucune route n'enregistre un tableau entier. Un `save` aurait obligé l'adaptateur à comparer deux tableaux pour en déduire des appels HTTP |
| État **plat**, deux collections reliées par `listId` | colonnes portant leurs cartes | chaque opération reste à un seul niveau de copie, donc la mutation accidentelle devient difficile à écrire |
| Tous les champs en `readonly` | discipline | le compilateur refuse `push` et `sort`. Bénéfice inattendu : `sort()` mute son receveur, donc trier pour l'affichage aurait silencieusement réordonné l'état |
| Identifiants générés **par le serveur** | `crypto.randomUUID()` côté client | le back rejette toute propriété non déclarée. Conséquence : pas de mise à jour optimiste |
| `fetch` natif, enveloppé une fois | axios | zéro dépendance de production pour brancher toute l'API |
| Le jeton dans `localStorage` | `sessionStorage`, mémoire seule, cookie `httpOnly` | voir la section 7, l'arbitrage est détaillé |
| La frontière de confiance est **le serveur** | une garde de route présentée comme sécurité | une garde côté client n'empêche pas d'accéder à une donnée, elle empêche d'afficher un écran inutile |
| Un **adaptateur mémoire** en plus de l'adaptateur API | un seul adaptateur | il permet de tester toute l'application sans serveur, et il rend la question « combien de fichiers » démontrable |
| **Couper** le routeur, le CSS raffiné et les 6 routes hors consigne | tout livrer | le planning a glissé d'une journée. Les coupes ont été décidées en bloc et tracées, pas subies |
| Un drapeau d'abandon plutôt qu'`AbortController` | l'annulation réelle | une requête annulée rejette avec une `AbortError` que le client traduirait en « serveur injoignable », soit un message à propos de quelque chose qu'on a fait soi-même |

**Une décision a été inversée et une autre corrigée en cours de route**, et les deux sont conservées telles quelles : la persistance, inversée avant d'écrire une ligne ; et la règle « 404 avant 403 », écrite de bonne foi puis démentie par la mesure, voir la section 7.

---

## 14. Structure du dépôt

```
src/
├── domain/          types et operations pures. AUCUN import de React, AUCUN fetch
│   ├── types.ts
│   └── operations.ts
├── api/             tout ce qui sait qu'une API existe
│   ├── http-client.ts    le SEUL fetch
│   ├── auth-api.ts       la SEULE route d'authentification
│   ├── dto.ts            ce que l'API envoie, et comment ca devient un objet du domaine
│   └── error-message.ts  comment une exception devient une phrase lisible
├── storage/
│   ├── storage.ts        interface BoardStorage, une methode par operation
│   ├── api-storage.ts    l'adaptateur de production, les SEULES routes du tableau
│   └── memory-storage.ts le double de test, en RAM
├── auth/
│   ├── token-storage.ts  le SEUL fichier qui sait ou vit le jeton
│   ├── auth-events.ts    porte le 401 du client HTTP jusqu'a React
│   └── use-auth.ts       connexion, deconnexion, purge sur 401
├── hooks/
│   ├── board-reducer.ts  la machine a etats, PURE, testee sans React
│   └── use-board.ts      le seul point ou l'etat React rencontre le domaine
├── components/
│   ├── Board.tsx  Column.tsx  Card.tsx  CardEditor.tsx
│   └── LoginForm.tsx  TitleForm.tsx
├── config.ts        valide VITE_API_URL, et echoue lisiblement
├── services.ts      LE point de composition
├── App.tsx          un seul useAuth, puis un rendu conditionnel
├── main.tsx         le SEUL fichier qui lit l'environnement
└── index.css        la SEULE feuille de style
```

**Six fichiers sur vingt-quatre n'ont pas de fichier de tests**, et chacun pour une raison précise :

| Fichier | Pourquoi |
|---|---|
| `domain/types.ts` | des types et une constante vide. Rien à exécuter |
| `storage/storage.ts` | une interface. Rien à exécuter |
| `api/dto.ts` | ses deux fonctions de conversion sont exercées par les 21 tests de `api-storage` |
| `components/Column.tsx` | testé à travers `Board`, qui monte l'arbre entier |
| `services.ts` | aucune décision, uniquement du câblage. Se vérifie en lançant l'application |
| `main.tsx` | idem |

Les dix-huit autres ont le leur.
