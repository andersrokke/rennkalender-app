// Personvernerklæringen. Åpen side på /personvern, uten innlogging, så den kan
// leses før man registrerer seg. Teksten beskriver det tjenesten faktisk gjør:
// endres det hva som lagres eller hvem som behandler det, må teksten endres
// samtidig - og datoen nederst.
const OPPDATERT = '5. oktober 2026'
const KONTAKT = 'anders.rokke@gmail.com'

export default function Personvern() {
  return (
    <div className="pv">
      <header className="pv-topp">
        <a className="pv-merke" href="/"><span className="merke" aria-hidden="true" />Alpinrace</a>
        <a className="btn small" href="/">Til innlogging</a>
      </header>
      <main className="pv-innhold">
        <p className="pv-lab">Personvern</p>
        <h1>Personvernerklæring</h1>
        <p className="pv-ingress">Her står hvilke opplysninger Alpinrace lagrer om deg, hva de brukes til,
          hvem som ser dem, og hvordan du får dem slettet.</p>

        <h2>Hvem er ansvarlig</h2>
        <p>Alpinrace drives av Anders Røkke, som er behandlingsansvarlig for opplysningene i tjenesten.
          Spørsmål om personvern sendes til <b>{KONTAKT}</b>.</p>

        <h2>Hva vi lagrer</h2>
        <div className="pv-tabell">
          <table>
            <thead><tr><th>Opplysning</th><th>Hvem det gjelder</th><th>Hvor den kommer fra</th></tr></thead>
            <tbody>
              <tr><td>E-postadresse og navn</td><td>Alle</td><td>Du oppgir den, eller den kommer fra Google når du logger inn der</td></tr>
              <tr><td>Passord</td><td>De som ikke bruker Google</td><td>Du velger det. Det lagres bare som en kryptert sjekksum</td></tr>
              <tr><td>Rolle, lag og skigymnas</td><td>Alle</td><td>Du velger selv, eller treneren legger deg i en gruppe</td></tr>
              <tr><td>Fødselsår, kjønn, FIS-kode og hjemsted</td><td>Løpere</td><td>Du fyller det inn i profilen</td></tr>
              <tr><td>Sesongplan: renn, status og reisemåte</td><td>Løpere</td><td>Du og treneren din</td></tr>
              <tr><td>Treningslogg: dato, bakke, gren, runs, føre, vær og notat</td><td>Løpere</td><td>Du og treneren din</td></tr>
              <tr><td>Tidtaking fra trening</td><td>Løpere</td><td>Treneren laster opp</td></tr>
              <tr><td>Satser for reise, overnatting, startkontingent og flypris</td><td>Foresatte</td><td>Du fyller dem inn</td></tr>
              <tr><td>Kobling mellom foresatt og løper</td><td>Foresatte og løpere</td><td>Opprettes når den foresatte bruker løperens kode</td></tr>
              <tr><td>Favoritter: FIS-koder du følger</td><td>Løpere og trenere</td><td>Du velger dem</td></tr>
              <tr><td>Tilbakemeldinger og hvilken nettleser de ble sendt fra</td><td>De som sender inn</td><td>Du skriver dem</td></tr>
              <tr><td>Tidspunkt for siste innlogging</td><td>Alle</td><td>Registreres automatisk</td></tr>
            </tbody>
          </table>
        </div>
        <p>Vi lagrer ikke helseopplysninger, fødselsnummer, adresse eller betalingsinformasjon.</p>

        <h2>Opplysninger fra FIS og iSonen</h2>
        <p>Resultater, FIS-poeng og cupstillinger hentes fra de åpne sidene til Det internasjonale skiforbundet (fis-ski.com)
          for løpere som har lagt inn FIS-koden sin, og for løpere noen har valgt å følge. Dette er opplysninger FIS selv
          publiserer. Fra iSonen hentes antall påmeldte til norske og svenske renn, og hvilke FIS-koder som står på åpne
          deltakerlister. Navn fra iSonen brukes bare til å finne riktig FIS-kode og lagres ikke.</p>

        <h2>Hva opplysningene brukes til</h2>
        <ul>
          <li>Å vise deg din egen sesongplan, treningslogg, resultater og utvikling.</li>
          <li>Å la treneren planlegge sesongen for laget og følge løperne sine.</li>
          <li>Å la foresatte følge barnets renn, påmeldingsfrister og kostnader.</li>
          <li>Å sende invitasjon til trenere, og å varsle den som drifter tjenesten når noen sender en tilbakemelding.</li>
        </ul>
        <p>Grunnlaget for behandlingen er avtalen du inngår når du oppretter konto og tar tjenesten i bruk
          (personvernforordningen artikkel 6 nr. 1 bokstav b). Opplysningene brukes ikke til reklame, og de selges
          eller deles ikke med andre.</p>

        <h2>Hvem ser hva</h2>
        <ul>
          <li><b>Løperen</b> ser sine egne opplysninger.</li>
          <li><b>Foresatte</b> ser løperens plan, treningslogg og resultater, men bare etter at løperen har gitt dem koden sin.
            Løperen kan når som helst fjerne en foresatt eller lage ny kode.</li>
          <li><b>Treneren</b> ser løperne i gruppene sine: profil, plan, treningslogg, tidtaking og resultater.
            Hovedtreneren på et skigymnas ser alle gruppene der.</li>
          <li><b>Lagkamerater</b> i samme gruppe kan se profilen din: navn, fødselsår, kjønn, FIS-kode og hjemsted.
            Står du på et skigymnas uten å være lagt i en gruppe, ser de andre løperne deg ikke.</li>
          <li><b>Den som drifter tjenesten</b> har tilgang til alt i databasen for å kunne rette feil og hjelpe brukere.</li>
        </ul>
        <p>Foresattes satser og kostnader vises bare for dem selv.</p>

        <h2>Hvem som behandler opplysningene for oss</h2>
        <div className="pv-tabell">
          <table>
            <thead><tr><th>Leverandør</th><th>Hva de gjør</th><th>Hvor</th></tr></thead>
            <tbody>
              <tr><td>Supabase</td><td>Database og innlogging. Her ligger alt du lagrer</td><td>EU (Irland)</td></tr>
              <tr><td>Netlify</td><td>Leverer selve nettsiden. Ser IP-adressen din når siden lastes</td><td>EU og USA</td></tr>
              <tr><td>Google</td><td>Innlogging med Google hvis du velger det, skriftene på siden, og utsending av e-post</td><td>EU og USA</td></tr>
              <tr><td>Esri</td><td>Kartbildene. Ser IP-adressen din når kartet lastes</td><td>EU og USA</td></tr>
            </tbody>
          </table>
        </div>
        <p>Der en leverandør holder til i USA, skjer overføringen etter EUs standardavtaler eller rammeverket
          mellom EU og USA for personvern.</p>

        <h2>Informasjonskapsler og lagring i nettleseren</h2>
        <p>Tjenesten bruker ingen informasjonskapsler til sporing eller statistikk. Nettleseren din husker at du er
          innlogget, hvilket språk og utseende du har valgt, og en lag- eller foreldrekode fra en lenke du har åpnet.
          Dette ligger bare i din nettleser.</p>

        <h2>Hvor lenge vi lagrer</h2>
        <p>Opplysningene lagres så lenge du har konto. Sletter du kontoen, fjernes profilen, planen, treningsloggen,
          tidtakingen, koblingene til foresatte, favorittene og tilbakemeldingene dine med en gang. Sikkerhetskopier
          hos databaseleverandøren kan inneholde opplysningene en kort periode etterpå, før de overskrives.
          Resultater som FIS selv har publisert, slettes ikke hos FIS.</p>

        <h2>Barn og unge</h2>
        <p>Tjenesten er laget for løpere som kjører FIS-renn, og for foresatte og trenere. Er du under 13 år,
          må en foresatt samtykke til at du bruker tjenesten. Foresatte kan be om innsyn i og sletting av
          opplysninger om barn de har foreldreansvar for.</p>

        <h2>Dine rettigheter</h2>
        <ul>
          <li><b>Innsyn:</b> du ser det meste selv i appen. Vil du ha en samlet kopi, ber du om det på e-post.</li>
          <li><b>Retting:</b> du retter profilen din under «Profil».</li>
          <li><b>Sletting:</b> under «Profil» → «Slett kontoen min» sletter du alt selv, med en gang.</li>
          <li><b>Klage:</b> mener du at vi behandler opplysningene dine feil, kan du klage til Datatilsynet, datatilsynet.no.</li>
        </ul>

        <h2>Sikkerhet</h2>
        <p>All trafikk går kryptert. Tilgangen styres i databasen, ikke bare i skjermene, så en bruker ikke kan hente
          opplysninger hun ikke skal se. Passord lagres ikke i klartekst.</p>

        <h2>Endringer</h2>
        <p>Endrer vi hva som lagres eller hvem som behandler det, oppdateres denne siden.</p>
        <p className="pv-dato">Sist oppdatert {OPPDATERT}.</p>
      </main>
    </div>
  )
}
