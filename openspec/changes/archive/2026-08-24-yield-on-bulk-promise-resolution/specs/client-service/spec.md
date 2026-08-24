## ADDED Requirements

### Requirement: Collect-all pagination SHALL yield between pages

When `ClientService` pagination collects every page into a single returned array (`searchAfter` collect-all and sequential offset collect-all), the client SHALL yield to the event loop after appending each page. Parallel pagination that already yields pages to the caller via an async generator is unchanged. HTTP `onPageProgress` callbacks SHALL still run after each page.

#### Scenario: searchAfter collect-all yields after each page

- **GIVEN** a `client.call` with `paginate.mode` `searchAfter` that returns more than one page
- **WHEN** pages are concatenated into the result array
- **THEN** the client SHALL yield to the event loop after each page is appended
- **AND** the returned array SHALL still contain every item in page order

#### Scenario: sequential collect-all yields after each page

- **GIVEN** a sequential offset paginated `client.call` that returns more than one page
- **WHEN** pages are concatenated into the result array
- **THEN** the client SHALL yield to the event loop after each page is appended

#### Scenario: Page progress callbacks still fire

- **GIVEN** collect-all pagination with `onPageProgress` configured
- **WHEN** a page is appended
- **THEN** `onPageProgress` SHALL be invoked with the updated loaded count
- **AND** the yield SHALL NOT skip that callback
