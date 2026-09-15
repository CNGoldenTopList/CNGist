/** Q&A 条目的分组。 */
export const qaCategories = ["rules", "general"] as const;
export type QaCategory = typeof qaCategories[number];
export const isQaCategory = (value: unknown): value is QaCategory =>
  typeof value === "string" && (qaCategories as readonly string[]).includes(value);
