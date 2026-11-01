import { describe, expect, it } from "vitest";
import { parseGedcom, parseGedDate, planImport } from "../src/lib/gedcom";
import type { Person } from "../src/types";

// Trecho no formato que o MyHeritage exporta.
const GED = `0 HEAD
1 SOUR MYHERITAGE
1 CHAR UTF-8
0 @I1@ INDI
1 NAME José /Furtado/
2 GIVN José
2 SURN Furtado
1 SEX M
1 BIRT
2 DATE 2 MAR 1915
2 PLAC Recife, Pernambuco, Brasil
1 DEAT
2 DATE 10 JUL 1990
1 RIN MH:I1
1 FAMS @F1@
0 @I2@ INDI
1 NAME Ana /Silva Furtado/
1 SEX F
1 BIRT
2 DATE ABT 1920
1 DEAT Y
1 RIN MH:I2
1 FAMS @F1@
0 @I3@ INDI
1 NAME Maria /Furtado/
1 SEX F
1 BIRT
2 DATE MAR 1975
1 RIN MH:I3
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
0 TRLR`;

describe("GEDCOM", () => {
  it("lê datas nos formatos do GEDCOM", () => {
    expect(parseGedDate("2 MAR 1915")).toBe("1915-03-02");
    expect(parseGedDate("ABT 1920")).toBe("1920");
    expect(parseGedDate("MAR 1975")).toBe("1975-03");
    expect(parseGedDate("BET 1950 AND 1955")).toBe("1950");
    expect(parseGedDate("")).toBe("");
  });

  it("lê pessoas, casais e filhos", () => {
    const ged = parseGedcom(GED);
    expect(ged).toHaveLength(3);
    const [jose, ana, maria] = ged;
    expect(jose).toMatchObject({ key: "MH:I1", firstName: "José", lastName: "Furtado", gender: "M", birthDate: "1915-03-02", deathDate: "1990-07-10", deceased: true, city: "Recife" });
    expect(ana).toMatchObject({ lastName: "Silva Furtado", birthDate: "1920", deceased: true });
    expect(jose.spouseXrefs).toEqual(["@I2@"]);
    expect(maria.parentXrefs).toEqual(["@I1@", "@I2@"]);
    expect(maria.deceased).toBe(false);
  });

  it("primeira importação cria todos e liga pais e cônjuges", () => {
    let n = 0;
    const plan = planImport(parseGedcom(GED), [], () => `new${n++}`);
    expect(plan.created).toHaveLength(3);
    const maria = plan.writes.find((w) => w.data.firstName === "Maria")!;
    expect(maria.data.parentIds).toEqual(["new0", "new1"]);
    expect(maria.data.branchId).toBeNull();
  });

  it("reimportação atualiza sem duplicar e preserva dados do site", () => {
    const site: Person[] = [
      { id: "a", firstName: "José", lastName: "Furtado", gedcomKey: "MH:I1", parentIds: [], spouseIds: ["b"], branchId: null },
      { id: "b", firstName: "Ana", lastName: "Silva Furtado", gedcomKey: "MH:I2", parentIds: [], spouseIds: ["a"], branchId: null },
      // Maria foi cadastrada à mão, com telefone, foto, ramo e login.
      { id: "m", firstName: "maria", lastName: "FURTADO", birthDate: "1975-03-15", phone: "999", photoURL: "x", city: "Natal", parentIds: [], spouseIds: [], branchId: "b5", uid: "u1" },
    ];
    const plan = planImport(parseGedcom(GED), site, () => "nunca");
    expect(plan.created).toHaveLength(0);
    expect(plan.updated).toHaveLength(3);
    const maria = plan.writes.find((w) => w.id === "m")!;
    expect(maria.isNew).toBe(false);
    expect(maria.data.parentIds).toEqual(["a", "b"]);
    expect(maria.data.birthDate).toBe("1975-03");
    expect(maria.data).not.toHaveProperty("phone");
    expect(maria.data).not.toHaveProperty("photoURL");
    expect(maria.data).not.toHaveProperty("branchId");
    expect(maria.data).not.toHaveProperty("uid");
    expect(maria.data).not.toHaveProperty("city");
  });
});
