// Raw response shapes from ESPN's unofficial fantasy API. Deliberately
// partial: only the fields this app actually reads are declared, and every
// one that has been observed missing on a real league is optional. Widening
// this file is the first step in supporting anything new — nothing outside
// lib/espn/ should ever see these types.

export interface EspnMember {
  id: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
}

export interface EspnPlayer {
  id: number;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  defaultPositionId?: number;
  proTeamId?: number;
  injuryStatus?: string;
  injured?: boolean;
  eligibleSlots?: number[];
}

export interface EspnRosterEntry {
  playerId: number;
  lineupSlotId: number;
  playerPoolEntry?: { player?: EspnPlayer };
}

export interface EspnRecordSplit {
  wins?: number;
  losses?: number;
  ties?: number;
  pointsFor?: number;
  pointsAgainst?: number;
}

export interface EspnTeam {
  id: number;
  abbrev?: string;
  // Current responses return a flat `name`; older ones split it across
  // location + nickname. Both are handled (see adapter.ts's espnTeamName()).
  name?: string;
  location?: string;
  nickname?: string;
  logo?: string;
  primaryOwner?: string;
  owners?: string[];
  playoffSeed?: number;
  points?: number;
  record?: { overall?: EspnRecordSplit };
  roster?: { entries?: EspnRosterEntry[] };
}

export interface EspnScoringItem {
  statId: number;
  points?: number;
  // Per-position overrides, keyed by ESPN position id as a string. Present on
  // leagues with position-dependent scoring (e.g. TE-premium PPR), where the
  // flat `points` above is 0 and meaningless.
  pointsOverrides?: Record<string, number>;
}

export interface EspnSettings {
  name?: string;
  size?: number;
  isPublic?: boolean;
  rosterSettings?: {
    // lineupSlotId (as a string key) -> how many of that slot the league runs.
    lineupSlotCounts?: Record<string, number>;
  };
  scheduleSettings?: {
    matchupPeriodCount?: number;
    playoffTeamCount?: number;
    // matchupPeriodId (as a string key) -> the NFL scoring periods (weeks) it
    // spans. Almost always 1:1, but multi-week matchups are legal.
    matchupPeriods?: Record<string, number[]>;
  };
  scoringSettings?: {
    scoringItems?: EspnScoringItem[];
  };
}

export interface EspnMatchupSide {
  teamId: number;
  totalPoints?: number;
}

export interface EspnScheduleGame {
  id?: number;
  matchupPeriodId: number;
  // "HOME" | "AWAY" | "UNDECIDED" — UNDECIDED means not yet final.
  winner?: string;
  // "NONE" for regular season; a bracket name otherwise.
  playoffTierType?: string;
  home?: EspnMatchupSide;
  // Absent on a bye.
  away?: EspnMatchupSide;
}

export interface EspnLeagueResponse {
  id: number;
  seasonId: number;
  // The NFL week ESPN considers current. 0 before the season starts.
  scoringPeriodId?: number;
  status?: {
    currentMatchupPeriod?: number;
    latestScoringPeriod?: number;
    finalScoringPeriod?: number;
    isActive?: boolean;
  };
  settings?: EspnSettings;
  members?: EspnMember[];
  teams?: EspnTeam[];
  schedule?: EspnScheduleGame[];
}
