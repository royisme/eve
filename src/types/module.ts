import { CAC } from "cac";

export interface EveModule {
  name: string;
  registerCommands(cli: CAC): void;
  getDailyBriefing?(): Promise<string>;
  onIngest?(event: any): Promise<void>;
}
