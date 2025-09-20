const { z } = require("zod");

const JoinRoomSchema = z.object({
  roomId: z.string().min(1),
  nickname: z.string().min(1).optional(),
});

const AnswerSubmitSchema = z.object({
  answer: z.union([z.boolean(), z.string(), z.number()]), // on parse strict côté RoomManager
});

const AdminNextSchema = z.object({
  roomId: z.string().min(1),
});

const AdminRevealSchema = z.object({
  roomId: z.string().min(1),
});


const RoomRulesSchema = z.object({
  category: z.enum(["G1", "G2", "G"]),
  minDifficulty: z.number().int().min(1).max(5).default(1),
  maxDifficulty: z.number().int().min(1).max(5).default(3),
}).refine((v) => v.minDifficulty <= v.maxDifficulty, {
  message: "minDifficulty doit être ≤ maxDifficulty",
  path: ["minDifficulty"],
});



module.exports = {
  JoinRoomSchema,
  AnswerSubmitSchema,
  AdminNextSchema,
  AdminRevealSchema,
  RoomRulesSchema,
};
