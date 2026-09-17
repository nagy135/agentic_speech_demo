import catalogue from "@/data/instruments.json";
export type Instrument = (typeof catalogue)[number];
export const instruments: Instrument[] = catalogue;
export const instrumentsById = new Map(
  instruments.map((item) => [item.id, item]),
);
