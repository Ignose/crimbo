import { CombatStrategy, Engine, Outfit, Quest, Task } from "grimoire-kolmafia";
import {
  bjornifyFamiliar,
  canAdventure,
  enthroneFamiliar,
  equip,
  equippedAmount,
  haveEquipped,
  itemAmount,
  Location,
  Monster,
  retrieveItem,
  runChoice,
  setAutoAttack,
  toUrl,
  visitUrl,
} from "kolmafia";
import {
  $familiar,
  $item,
  $location,
  CrownOfThrones,
  CrystalBall,
  get,
  have,
  JuneCleaver,
  PropertiesManager,
} from "libram";

import { bestJuneCleaverOption, shouldSkip } from "./juneCleaver";
import { args, printd, printh, sober, unsupportedChoices } from "./lib";
import Macro from "./macro";

export type CrimboTask = Task & {
  sobriety: "sober" | "drunk" | "either";
  forced?: boolean;
};

export type CrimboQuest = Quest<CrimboTask> & {
  location: Location;
};

const introAdventures: string[] = [];
export class CrimboStrategy extends CombatStrategy {
  constructor(macro: () => Macro) {
    super();
    this.macro(macro).autoattack(macro);
  }
}

function countAvailableNcForces() {
  return (get("_claraBellUsed") ? 0 : 1) + (5 - get("_spikolodonSpikeUses"));
}

let ncForced = false;
export function resetNcForced() {
  printd("Reset NC forcing");
  ncForced = false;
}
CrownOfThrones.createRiderMode("default", () => 0);
const chooseRider = () => CrownOfThrones.pickRider("default");
export class CrimboEngine extends Engine<never, CrimboTask> {
  private static currentPonder = CrystalBall.ponder();
  private static hasPondered = true;

  private static updatePonder(): void {
    CrimboEngine.currentPonder = CrystalBall.ponder();
    CrimboEngine.hasPondered = true;
  }

  static get ponder(): Map<Location, Monster> {
    if (!CrimboEngine.hasPondered) CrimboEngine.updatePonder();
    return CrimboEngine.currentPonder;
  }

  static toasterGaze(): void {
    const shore = $location`The Shore, Inc. Travel Agency`;
    const pass = $item`Desert Bus pass`;
    if (!canAdventure(shore) && !have(pass)) {
      retrieveItem(pass);
    }
    try {
      const store = visitUrl(toUrl(shore));
      if (!store.includes("Check out the gift shop")) {
        printh("Unable to stare longingly at toast");
      }
      runChoice(4);
    } catch (e) {
      printd(`We ran into an issue when gazing at toast: ${e}.`);
    } finally {
      visitUrl("main.php");
    }
    CrimboEngine.updatePonder();
  }

  do(task: CrimboTask): void {
    super.do(task);
    CrimboEngine.hasPondered = false;
  }

  available(task: CrimboTask): boolean {
    const sobriety =
      task.sobriety === "either" ||
      (sober() && task.sobriety === "sober") ||
      (!sober() && task.sobriety === "drunk");

    if (task.forced) {
      return sobriety && ncForced && super.available(task);
    }
    return sobriety && super.available(task);
  }

  initPropertiesManager(manager: PropertiesManager): void {
    super.initPropertiesManager(manager);
    for (const choices of unsupportedChoices.values()) manager.setChoices(choices);
    const priority = args.priority as "elves" | "parts" | "pingpong";
    // Caboose
    manager.setChoice(1486, { parts: 1, elves: 2, pingpong: 3 }[priority]);
    // Passenger; only one option
    manager.setChoice(1487, 1);
    // Dining: always pick option one (luggage)
    manager.setChoice(1488, 1);
  }

  dress(task: CrimboTask, outfit: Outfit): void {
    super.dress(task, outfit);
    if (haveEquipped($item`Buddy Bjorn`)) {
      const choice = chooseRider();
      if (choice) bjornifyFamiliar(choice.familiar);
    } else if (haveEquipped($item`Crown of Thrones`)) {
      const choice = chooseRider();
      if (choice) enthroneFamiliar(choice.familiar);
    }
    if (itemAmount($item`tiny stillsuit`)) {
      equip($familiar`Mosquito`, $item`tiny stillsuit`);
    }
  }

  execute(task: CrimboTask): void {
    const ncBefore = countAvailableNcForces();
    super.execute(task);
    const ncAfter = countAvailableNcForces();

    if (ncBefore > ncAfter) {
      ncForced = true;
    }
  }

  setChoices(task: CrimboTask, manager: PropertiesManager): void {
    super.setChoices(task, manager);
    if (equippedAmount($item`June cleaver`) > 0) {
      this.propertyManager.setChoices(
        Object.fromEntries(
          JuneCleaver.choices.map((choice) => [
            choice,
            shouldSkip(choice) ? 4 : bestJuneCleaverOption(choice),
          ])
        )
      );
    }
    this.propertyManager.setChoices({ 955: 2 });
  }

  shouldRepeatAdv(task: CrimboTask): boolean {
    if (["Poetic Justice", "Lost and Found"].includes(get("lastEncounter"))) {
      printd("Skipping repeating Adventure despite free NC (beaten up)");
      return false;
    }
    if (introAdventures.includes(get("lastEncounter"))) {
      printd(`Hit Intro adventure ${get("lastEncounter")} which is a free NC`);
      return true;
    }
    if (task.name.includes("June Cleaver")) return false;
    return super.shouldRepeatAdv(task);
  }

  print() {
    printd(`Task List:`);
    for (const task of this.tasks) {
      printd(`${task.name}: available:${this.available(task)}`);
    }
  }

  destruct(): void {
    super.destruct();
    setAutoAttack(0);
  }
}
