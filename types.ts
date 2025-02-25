export interface RoomDistribution {
  [room: string]: string[];
}

export interface DayDistribution {
  day: number;
  distribution: RoomDistribution;
}