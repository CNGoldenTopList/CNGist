/** /qa 页面的问答条目读取。内容是管理员维护的数据，不进界面词典。 */
import { asc } from "drizzle-orm";
import { db } from "../../db/client";
import { qaEntry } from "../../db/schema/index";
import { isQaCategory, type QaCategory } from "../../../../shared/src/qa";

export type QaItem = {
  id: number;
  category: QaCategory;
  question: string;
  answer: string;
  questionEn: string | null;
  answerEn: string | null;
  position: number;
};

export async function readQaEntries(): Promise<QaItem[]> {
  const rows = await db.select({
    id: qaEntry.id,
    category: qaEntry.category,
    question: qaEntry.question,
    answer: qaEntry.answer,
    questionEn: qaEntry.questionEn,
    answerEn: qaEntry.answerEn,
    position: qaEntry.position,
  }).from(qaEntry).orderBy(asc(qaEntry.position), asc(qaEntry.createdAt));
  // 分组顺序由 qaCategories 决定，不靠 position 跨组排；库里的非法值当作 general。
  return rows.map((row) => ({ ...row, category: isQaCategory(row.category) ? row.category : "general" }));
}
