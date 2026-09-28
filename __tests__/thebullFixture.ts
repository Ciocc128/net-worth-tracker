/**
 * A SYNTHETIC newsletter in TheBull's Mailchimp template (doc/ai-open-models-wiki.md § 5.2):
 * same section markers, same bullet and table shapes, invented prose with decoy words
 * («fenicottero», «ornitorinco») that appear nowhere else. No real issue is ever committed —
 * the text is TheBull's, and the real body carries the subscriber's id in its links.
 */

export const DECOY_SUBSCRIBER = 'e=abc123def4';

export function theBullPlainBody({ issueLine = '#7 - 14/06/2026', withPointMarker = true } = {}): string {
  return `Visualizza questa email nel browser (https://mailchi.mp/abc/test-fenicottero?${DECOY_SUBSCRIBER})
https://www.thebull.it?utm_source=nl

${issueLine}


** LA SETTIMANA DEL FENICOTTERO. E DELL'ORNITORINCO.
------------------------------------------------------------

Tassi fenicottero in salita, ornitorinco sotto pressione.


** IN BREVE:
------------------------------------------------------------
* Il punto della settimana (#Il-punto-della-settimana) : Il fenicottero decennale ha superato il 4,25%.
* Rendimento dei principali indici (#Rendimenti-indici) : i numeri aggiornati.

https://academy.thebull.it/

Nella Academy trovi un percorso completo.
Scopri il programma (https://academy.thebull.it/)

${withPointMarker ? `
** IL PUNTO DELLA SETTIMANA ()
------------------------------------------------------------
` : ''}

** Il fenicottero vola
------------------------------------------------------------

Il fenicottero decennale è arrivato al 4,25%, il massimo da 12 anni.

La banca dell'ornitorinco ha alzato i tassi il 3 giugno.


** Cosa ne pensiamo
------------------------------------------------------------

Secondo noi la salita dei rendimenti è una storia di crescita, non di inflazione.

Chi ha un orizzonte lungo non dovrebbe vendere nel panico.


** LETTURE CONSIGLIATE ()
------------------------------------------------------------
* Perché il fenicottero conta (Rivista Ornitorinco (https://example.com/fenicottero) )
* Tassi e piume (Blog Piume (https://example.org/piume) )


** SPONSORED BY
------------------------------------------------------------
https://partner.example.com/go?pid=1

Broker Ornitorinco: interessi del 9%.


** DAGLI EPISODI DELLA SCORSA SETTIMANA ()
------------------------------------------------------------


** 101. Il fenicottero e il tuo mutuo
------------------------------------------------------------
https://youtu.be/fenicottero

Parliamo di mutui e fenicotteri.
Ascolta l’episodio (https://youtu.be/fenicottero)


** RENDIMENTO DEI PRINCIPALI INDICI ()
------------------------------------------------------------
1 mese    1 anno    5 anni    10 anni
MSCI All Country World +1.10% +12.50% +60.00% +150.25%
Oro                    -0.50% +8.00% +90.10% +120.00%
Variazioni in % al 14/06/2026 in Euro.


** NEL PROSSIMO EPISODIO ()
------------------------------------------------------------

Lunedì parliamo dell'ornitorinco.
https://us14.forward-to-friend.com/forward?u=1&${DECOY_SUBSCRIBER} Se ti è piaciuta questa newsletter condividila! (https://us14.forward-to-friend.com/forward?u=1&${DECOY_SUBSCRIBER})


** Seguici su
------------------------------------------------------------
https://www.youtube.com/@example

Copyright (C) 2026 Esempio Srl
Puoi aggiorna le tue preferenze (https://thebull.us14.list-manage.com/profile?u=1&${DECOY_SUBSCRIBER}) o annulla l’iscrizione (https://thebull.us14.list-manage.com/unsubscribe?u=1&${DECOY_SUBSCRIBER})
`;
}

/** A faithful extraction of the synthetic point: every quote copied from it. */
export const FAITHFUL_EXTRACTION = {
  fatti: [
    {
      area: 'obbligazionario' as const,
      paese: 'Fenicottero',
      sintesi: 'Il decennale al 4,25%, massimo da 12 anni.',
      citazione: 'Il fenicottero decennale è arrivato al 4,25%, il massimo da 12 anni.',
    },
    {
      area: 'banche-centrali' as const,
      paese: '',
      sintesi: "La banca dell'ornitorinco ha alzato i tassi il 3 giugno.",
      citazione: "La banca dell'ornitorinco ha alzato i tassi il 3 giugno.",
    },
  ],
  tesi: [
    {
      area: 'tassi' as const,
      sintesi: 'La salita è crescita, non inflazione.',
      citazione: 'Secondo noi la salita dei rendimenti è una storia di crescita, non di inflazione.',
    },
  ],
  spunti: [
    {
      sintesi: 'Con orizzonte lungo non vendere nel panico.',
      citazione: 'Chi ha un orizzonte lungo non dovrebbe vendere nel panico.',
    },
  ],
};
