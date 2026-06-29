## 1. Implement Response Wrapper

- [ ] 1.1 Create the `safeRes` proxy object inside `createOperationHandler`
- [ ] 1.2 Update the `send` and `error` methods on the proxy to toggle a local boolean flag `responseSent`
- [ ] 1.3 Pass the `safeRes` proxy down to `new ServiceRegistry(...)` instead of the raw `res` object

## 2. Enforce Response Guarantee

- [ ] 2.1 Add a check immediately after `await runOperation(...)` in the `try` block
- [ ] 2.2 If `!responseSent`, throw a clear error: `"Operation finished without calling res.send() or res.error()"`

## 3. Testing and Validation

- [ ] 3.1 Verify existing tests still pass and the new throw does not swallow legitimate `ConnectorError`s
