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

module.exports = {
  JoinRoomSchema,
  AnswerSubmitSchema,
  AdminNextSchema,
  AdminRevealSchema,
};
