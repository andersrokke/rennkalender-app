import { createContext, useContext } from 'react'

// Dictionary for the signed-in app. Race-list wording follows the prototype.
export const I18N = {
  no: {
    appTitle: 'Rennkalender 2026/27',
    // tabs
    season: 'Lagets sesong', athletes: 'Løpere', races: 'Alle renn', plan: 'Min plan',
    mine: 'Min sesong', settingsTab: 'Profil', settingsTabCoach: 'Lag og profil',
    // roles / header
    coach: 'trener', parent: 'forelder', athlete: 'løper', signOut: 'Logg ut',
    loading: 'Laster …', loadingProfile: 'Henter profil …',
    // onboarding
    welcome: 'Velkommen', coachOrAthlete: 'Er du trener eller løper?',
    optCoach: 'Jeg er trener – opprett lag', optAthlete: 'Jeg er løper – bli med i et lag',
    optSolo: 'Jeg er løper – bruk kalenderen på egen hånd',
    soloIntro: 'Du planlegger sesongen selv. Du kan bli med i et lag senere under «Profil».',
    yourName: 'Ditt navn', teamName: 'Lagnavn', club: 'Klubb (valgfritt)',
    inviteFromCoach: 'Invitasjonskode fra treneren', createTeam: 'Opprett lag', join: 'Bli med',
    start: 'Kom i gang', gender: 'Kjønn', birthYear: 'Fødselsår', fisCode: 'FIS-kode',
    woman: 'Kvinne', man: 'Mann',
    // statuses
    st_planned: 'Planlagt', st_entered: 'Påmeldt', st_wish: 'Ønsker', st_reserve: 'Reserve', st_unavailable: 'Kan ikke',
    // race browser
    addMine: 'Legg til i min plan', removeMine: 'Fjern fra min plan',
    addTeam: 'Legg til for laget', removeTeam: 'Fjern fra laget', onTeamPlan: 'På lagets plan',
    fromHome: 'km fra hjem', signups: 'Påmeldte', heat: 'Heatmap', few: 'få', many: 'mange påmeldte',
    signed: 'påmeldte', ofCap: 'av', week: 'siste 7 d', deadline: 'frist', dShort: 'd',
    noNumbers: 'Ingen tall ennå', srcLive: 'iSonen · oppdatert', srcNone: 'ingen data ennå',
    // planner
    home: 'Hjemsted', inPlan: 'renn i planen', tripsN: 'reiser',
    planEmpty: 'Planen er tom. Legg til renn under «Alle renn», så regner jeg ut reise, netter og kostnad.',
    wholeSeason: 'Hele sesongen', racesN: 'renn', trip: 'Reise', homeShort: 'Hjem',
    km: 'km', mil: 'mil', hours: 't i bil', nights: 'netter', cost: 'kr', daysAway: 'dager borte',
    drive: 'kjøring', stay: 'opphold', fees: 'startkontingent',
    kmRate: 'kr per km', hotel: 'kr per natt', entry: 'kr per renndag',
    maxGap: 'maks dager mellom renn for å reise videre',
    hint: 'Kjørelengde er estimert (luftlinje × 1,3). Ligger to renn nær hverandre i tid, reiser du videre i stedet for hjem.',
    noVenue: 'renn i planen mangler sted på kartet og er ikke regnet med.',
    // my season
    inMyPlan: 'renn i min plan', chosen: 'valgt', teamPlanN: 'renn i lagets plan',
    soloEmpty: 'Du har ikke lagt til noen renn ennå. Gå til «Alle renn» og legg dem til i planen din.',
    teamEmpty: 'Treneren har ikke lagt inn renn for laget ennå.',
    note: 'Notat', editNote: 'Endre notat', save: 'Lagre', cancel: 'Avbryt', coachSays: 'Trener:',
    // settings / team
    team: 'Laget', inviteHint: 'Løpere blir med ved å oppgi denne koden når de logger inn første gang.',
    myProfile: 'Min profil', name: 'Navn', leaveTeam: 'Forlat laget', saved: 'Lagret',
    joinTeam: 'Bli med i et lag', inviteCode: 'Invitasjonskode',
    joinHint: 'Har du fått en invitasjonskode fra treneren din, kan du bli med her. Rennene du allerede har lagt til beholder du.',
    tabMap: 'Kart', tabList: 'Renn', tabPlanM: 'Min plan', tabFilter: 'Filtre',
    filters: 'Filtre', done: 'Ferdig',
    install: 'Legg til', later: 'Ikke nå',
    installBody: 'Legg Rennkalender på hjem-skjermen, så åpner den som en app.',
    installIos: 'Legg på hjem-skjermen: trykk Del-knappen og velg «Legg til på Hjem-skjerm».',
    country: 'Land', norway: 'Norge', sweden: 'Sverige', finland: 'Finland', ecLands: 'Europacup-land',
    mapF: 'Kart', nordics: 'Norden', alps: 'Alpene', europe: 'Europa',
    women: 'Damer', men: 'Menn', month: 'Måned', allM: 'Alle', disc: 'Disiplin', cat: 'Kategori',
    coachEmpty: 'Ingen renn valgt ennå. Gå til «Alle renn» og trykk «Legg til for laget».',
    leaveConfirm: 'Forlate laget?',
    noTeamTitle: 'Du har ikke et lag ennå',
    noTeamBody: 'Opprett et lag for å planlegge sesongen, invitere løpere med en kode og sette status per renn. Du kan fortsatt se «Alle renn» uten lag.'
  },
  en: {
    appTitle: 'Race calendar 2026/27',
    season: 'Team season', athletes: 'Athletes', races: 'All races', plan: 'My plan',
    mine: 'My season', settingsTab: 'Profile', settingsTabCoach: 'Team and profile',
    coach: 'coach', parent: 'parent', athlete: 'athlete', signOut: 'Sign out',
    loading: 'Loading …', loadingProfile: 'Fetching profile …',
    welcome: 'Welcome', coachOrAthlete: 'Are you a coach or an athlete?',
    optCoach: 'I am a coach – create a team', optAthlete: 'I am an athlete – join a team',
    optSolo: 'I am an athlete – use the calendar on my own',
    soloIntro: 'You plan the season yourself. You can join a team later under “Profile”.',
    yourName: 'Your name', teamName: 'Team name', club: 'Club (optional)',
    inviteFromCoach: 'Invite code from your coach', createTeam: 'Create team', join: 'Join',
    start: 'Get started', gender: 'Gender', birthYear: 'Year of birth', fisCode: 'FIS code',
    woman: 'Woman', man: 'Man',
    st_planned: 'Planned', st_entered: 'Entered', st_wish: 'Wish', st_reserve: 'Reserve', st_unavailable: 'Unavailable',
    addMine: 'Add to my plan', removeMine: 'Remove from my plan',
    addTeam: 'Add for the team', removeTeam: 'Remove from team', onTeamPlan: 'On team plan',
    fromHome: 'km from home', signups: 'Sign-ups', heat: 'Heatmap', few: 'few', many: 'many sign-ups',
    signed: 'signed up', ofCap: 'of', week: 'last 7 d', deadline: 'deadline', dShort: 'd',
    noNumbers: 'No numbers yet', srcLive: 'iSonen · updated', srcNone: 'no data yet',
    home: 'Home base', inPlan: 'races in the plan', tripsN: 'trips',
    planEmpty: 'Your plan is empty. Add races under “All races” and I will work out travel, nights and cost.',
    wholeSeason: 'Whole season', racesN: 'races', trip: 'Trip', homeShort: 'Home',
    km: 'km', mil: 'mil', hours: 'h driving', nights: 'nights', cost: 'NOK', daysAway: 'days away',
    drive: 'driving', stay: 'lodging', fees: 'entry fees',
    kmRate: 'NOK per km', hotel: 'NOK per night', entry: 'NOK per race day',
    maxGap: 'max days between races to continue travelling',
    hint: 'Driving distance is estimated (straight line × 1.3). If two races are close in time you travel on instead of going home.',
    noVenue: 'races in the plan have no venue on the map and are not counted.',
    inMyPlan: 'races in my plan', chosen: 'chosen', teamPlanN: 'races in the team plan',
    soloEmpty: 'You have not added any races yet. Go to “All races” and add them to your plan.',
    teamEmpty: 'Your coach has not added any races for the team yet.',
    note: 'Note', editNote: 'Edit note', save: 'Save', cancel: 'Cancel', coachSays: 'Coach:',
    team: 'Team', inviteHint: 'Athletes join by entering this code the first time they sign in.',
    myProfile: 'My profile', name: 'Name', leaveTeam: 'Leave team', saved: 'Saved',
    joinTeam: 'Join a team', inviteCode: 'Invite code',
    joinHint: 'If your coach gave you an invite code, you can join here. The races you have already added are kept.',
    tabMap: 'Map', tabList: 'Races', tabPlanM: 'My plan', tabFilter: 'Filters',
    filters: 'Filters', done: 'Done',
    install: 'Add', later: 'Not now',
    installBody: 'Add Rennkalender to your home screen and it opens like an app.',
    installIos: 'Add to home screen: tap the Share button and choose “Add to Home Screen”.',
    country: 'Country', norway: 'Norway', sweden: 'Sweden', finland: 'Finland', ecLands: 'Europa Cup countries',
    mapF: 'Map', nordics: 'Nordics', alps: 'Alps', europe: 'Europe',
    women: 'Women', men: 'Men', month: 'Month', allM: 'All', disc: 'Discipline', cat: 'Category',
    coachEmpty: 'No races chosen yet. Go to “All races” and press “Add for the team”.',
    leaveConfirm: 'Leave the team?',
    noTeamTitle: 'You do not have a team yet',
    noTeamBody: 'Create a team to plan the season, invite athletes with a code and set a status per race. You can still browse “All races” without a team.'
  }
}

export const LangContext = createContext('no')
export const useT = () => {
  const lang = useContext(LangContext)
  const dict = I18N[lang] || I18N.no
  return Object.assign(k => dict[k] ?? I18N.no[k] ?? k, { lang })
}
