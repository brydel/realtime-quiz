function validatePayload(socket, eventName, schema, payload, onSuccess) {
  const res = schema.safeParse(payload);
  if (!res.success) {
    socket.emit("system:notice", {
      type: "validation",
      event: eventName,
      errors: res.error.errors.map((e) => ({ path: e.path, message: e.message })),
    });
    return;
  }
  onSuccess(res.data);
}

module.exports = { validatePayload };
