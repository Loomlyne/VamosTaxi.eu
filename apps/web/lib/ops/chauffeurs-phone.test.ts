// 26.2-u03a: the Swiss "+41 (0)79 ..." form keeps its trunk zero as a real digit.

import { describe, expect, it, vi } from "vitest";

vi.mock("../db/identity", () => ({ asStaff: vi.fn() }));

import { assertChauffeurInput, type ChauffeurInput } from "./chauffeurs";

function withPhone(phone: string): ChauffeurInput {
  return { fullName: "Test Driver", phone, licenceNumber: "" };
}

describe("chauffeur phone normalisation, (0) trunk digit", () => {
  it("drops the bracketed trunk zero after a country code", () => {
    expect(assertChauffeurInput(withPhone("+41 (0)79 000 00 01")).phone).toBe("+41790000001");
    expect(assertChauffeurInput(withPhone("0041 (0) 79 000 00 01")).phone).toBe("+41790000001");
  });

  it("keeps the existing shapes", () => {
    expect(assertChauffeurInput(withPhone("079 000 00 01")).phone).toBe("+41790000001");
    expect(assertChauffeurInput(withPhone("+971 50 975 8018")).phone).toBe("+971509758018");
  });
});
