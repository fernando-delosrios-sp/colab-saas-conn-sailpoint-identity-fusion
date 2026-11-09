# Internal-record benchmark

Generated fixture: 5000 anonymized rows with nativeIdentity, name, employeeNumber, and department.
Representative fixture: `fixtures/representative-anonymized.csv` (5 rows, including a quoted name).

Elapsed time for the compiled reader starts after packaging and a garbage collection. Package bytes include the manifest and shards. A ramfs-backed runtime filesystem does not reduce the memory budget: file pages for either format can count toward resident memory. This run is local evidence, not a deployment-ramfs measurement.

| Reader | Fixture | Records | Package bytes | Elapsed ms | Records/s | Heap used | Heap total | External | RSS | Filesystem |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| csv | generated-5000 | 5000 | 194716 | 6 | 855115 | 12392232 | 16252928 | 6570923 | 88965120 | apfs |
| compiled | generated-5000 | 5000 | 274965 | 6 | 783433 | 14569720 | 26214400 | 6583354 | 101711872 | apfs |
| csv | representative-anonymized.csv | 5 | 220 | 5 | 1075 | 9215352 | 11534336 | 6243274 | 82526208 | apfs |
| compiled | representative-anonymized.csv | 5 | 574 | 1 | 5533 | 8921296 | 11534336 | 6243265 | 82870272 | apfs |

Short text rows carry a 4-byte length before every value, so the compiled artifact can be larger than the source CSV. The compiled form is the packaged source: it is validated once, does not ship the CSV, and is read one record at a time.

## Fernando tenant (company12926-poc)

Measured on 2026-11-03 by a one-off Records customizer linked to Identity Fusion NG. Test Connection loaded customizer version 3 beside connector version 327. The probe was unlinked and deleted afterward. The hook read the whole shard into one buffer, so its rate is not the streaming reader from the local table.

The packaged files were at `/app/customizer/data/internal-records`. That path is an overlay mount. Its upper directory is `/overlay-tmp/customizer-upper`, and `/overlay-tmp` is tmpfs. There was no ramfs mount. The cgroup memory files were not readable from the process, so this run does not show a container memory-counter delta. The tmpfs upper layer means the packaged bytes reside in memory.

| Records | Package bytes | Elapsed ms | Records/s | Heap before | Heap after | RSS before | RSS after | Filesystem | Upper directory |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 5000 | 274979 | 10 | 500000 | 44455880 | 45305040 | 112267264 | 114028544 | overlay on tmpfs | `/overlay-tmp/customizer-upper` |
