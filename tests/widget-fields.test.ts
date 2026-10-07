import { describe, it, expect } from "vitest";
import {
  addableBuiltins,
  customKey,
  defaultFields,
  splitContactAnswers,
  splitRegistrationAnswers,
  DEFAULT_FIELDS,
  fieldsInputSchema,
  normalizeFields,
  splitAnswers,
  submissionSchema,
  type Field,
} from "../lib/widgets/fields";

const custom = (f: Partial<Field> & Pick<Field, "key" | "type">): Field => ({ label: "Q", required: false, ...f });

describe("normalizeFields", () => {
  it("falls back to the defaults for nothing or junk", () => {
    expect(normalizeFields([])).toEqual(DEFAULT_FIELDS);
    expect(normalizeFields("nonsense")).toEqual(DEFAULT_FIELDS);
    // Missing must-haves go back in: name first, the rest at the end.
    expect(normalizeFields([{ key: "custom_car", label: "Car", type: "text", required: false }]).map((f) => f.key)).toEqual([
      "full_name",
      "custom_car",
      "phone",
    ]);
  });

  it("always includes name and phone, required, and forces built-in types", () => {
    const fields = normalizeFields([
      { key: "email", label: "Email", type: "text", required: true },
      { key: "phone", label: "Cell", type: "text", required: false },
    ]);
    expect(fields.map((f) => f.key)).toEqual(["full_name", "email", "phone"]);
    expect(fields.find((f) => f.key === "phone")).toMatchObject({ type: "tel", required: true, label: "Cell" });
    expect(fields.find((f) => f.key === "email")?.type).toBe("email");
  });

  it("drops invalid keys, duplicates and choice lists without choices", () => {
    const fields = normalizeFields([
      ...DEFAULT_FIELDS,
      { key: "password", label: "Password", type: "text", required: true },
      { key: "custom_car", label: "Car", type: "text", required: false },
      { key: "custom_car", label: "Car again", type: "text", required: false },
      { key: "custom_size", label: "Size", type: "select", required: false, options: [] },
    ]);
    expect(fields.map((f) => f.key)).toEqual(["full_name", "phone", "email", "notes", "custom_car"]);
  });
});

describe("fieldsInputSchema", () => {
  it("refuses duplicate keys and empty choice lists", () => {
    const base = DEFAULT_FIELDS;
    expect(fieldsInputSchema.safeParse(base).success).toBe(true);
    expect(fieldsInputSchema.safeParse([...base, base[0]]).success).toBe(false);
    expect(fieldsInputSchema.safeParse([...base, custom({ key: "custom_x", type: "select", options: [] })]).success).toBe(false);
  });
});

describe("submissionSchema", () => {
  const fields = normalizeFields([
    ...DEFAULT_FIELDS,
    custom({ key: "custom_hair", label: "Hair length", type: "select", required: true, options: ["Short", "Long"] }),
    custom({ key: "custom_terms", label: "I'm over 18", type: "checkbox", required: true }),
    custom({ key: "custom_reg", label: "Vehicle reg", type: "text" }),
  ]);
  const schema = submissionSchema(fields);
  const valid = {
    full_name: "Thandi Mokoena",
    phone: "082 123 4567",
    email: "",
    notes: "",
    custom_hair: "Long",
    custom_terms: true,
  };

  it("accepts a good submission, treating empty optional answers as missing", () => {
    const result = schema.safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.data?.email).toBeUndefined();
  });

  it("accepts SA numbers both ways and refuses junk", () => {
    expect(schema.safeParse({ ...valid, phone: "+27 82 123 4567" }).success).toBe(true);
    const bad = schema.safeParse({ ...valid, phone: "12345" });
    expect(bad.error?.issues[0]?.message).toMatch(/valid mobile number/);
  });

  it("enforces required answers, choices and tick boxes", () => {
    expect(schema.safeParse({ ...valid, full_name: "  " }).success).toBe(false);
    expect(schema.safeParse({ ...valid, custom_hair: "Purple" }).success).toBe(false);
    expect(schema.safeParse({ ...valid, custom_terms: false }).success).toBe(false);
    expect(schema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });

  it("ignores fields the business didn't configure, however they're sent", () => {
    const result = schema.safeParse({ ...valid, custom_injected: "x", is_admin: true });
    expect(result.success).toBe(true);
    expect(Object.keys(result.data!)).not.toContain("custom_injected");
    expect(Object.keys(result.data!)).not.toContain("is_admin");
  });

  it("splits answers into booking columns and custom details", () => {
    const answers = splitAnswers(schema.parse({ ...valid, email: "T@Example.com", custom_reg: "CA 123" }));
    expect(answers).toEqual({
      name: "Thandi Mokoena",
      phone: "082 123 4567",
      email: "t@example.com",
      notes: "",
      details: { custom_hair: "Long", custom_terms: true, custom_reg: "CA 123" },
    });
  });
});

describe("customKey", () => {
  it("makes a unique custom key from a label", () => {
    expect(customKey("Vehicle registration", [])).toBe("custom_vehicle_registration");
    expect(customKey("Vehicle registration", ["custom_vehicle_registration"])).toBe("custom_vehicle_registration_2");
  });
});

describe("contact form", () => {
  it("always asks name and message, and drops another form's built-ins", () => {
    const fields = normalizeFields(
      [
        { key: "email", label: "Email", type: "email", required: false },
        { key: "notes", label: "Notes", type: "textarea", required: false },
      ],
      "contact",
    );
    expect(fields.map((f) => f.key)).toEqual(["full_name", "email", "message"]);
    expect(fields.find((f) => f.key === "message")?.required).toBe(true);
  });

  it("needs an email or a phone to reply on", () => {
    const schema = submissionSchema(defaultFields("contact"), "contact");
    expect(schema.safeParse({ full_name: "Thandi", message: "Hi" }).error?.issues[0]?.message).toMatch(/email address or a phone/);
    expect(schema.safeParse({ full_name: "Thandi", message: "Hi", phone: "082 123 4567" }).success).toBe(true);
    expect(schema.safeParse({ full_name: "Thandi", message: "Hi", email: "t@example.com" }).success).toBe(true);
  });

  it("splits a message into its columns", () => {
    const fields = normalizeFields([...defaultFields("contact"), ...addableBuiltins("contact", defaultFields("contact"))], "contact");
    const values = submissionSchema(fields, "contact").parse({
      full_name: "Thandi",
      email: "",
      phone: "082 123 4567",
      subject: "Prices",
      message: "How much is a cut?",
    });
    expect(splitContactAnswers(values)).toEqual({
      name: "Thandi",
      email: null,
      phone: "082 123 4567",
      subject: "Prices",
      message: "How much is a cut?",
      details: {},
    });
  });

  it("offers the subject list as an optional built-in", () => {
    expect(addableBuiltins("contact", defaultFields("contact")).map((f) => f.key)).toEqual(["subject"]);
    expect(addableBuiltins("booking", DEFAULT_FIELDS)).toEqual([]);
  });
});

describe("registration form", () => {
  it("always asks name and email (the link goes by email)", () => {
    const fields = normalizeFields([{ key: "phone", label: "Cell", type: "tel", required: false }], "registration");
    expect(fields.map((f) => [f.key, f.required])).toEqual([
      ["full_name", true],
      ["phone", false],
      ["email", true],
    ]);
    const schema = submissionSchema(defaultFields("registration"), "registration");
    expect(schema.safeParse({ full_name: "T", email: "" }).success).toBe(false);
    expect(splitRegistrationAnswers(schema.parse({ full_name: "T", email: "T@Example.com", phone: "" }))).toEqual({
      name: "T",
      email: "t@example.com",
      phone: null,
      details: {},
    });
  });
});
