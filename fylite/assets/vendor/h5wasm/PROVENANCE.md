# h5wasm —— 出处与许可

★**这是别人的代码，逐字节照抄，一处未改。** 本目录由 `tools/vendor-h5wasm.mjs`
写出；改版本要改那个脚本里的 `VERSION` 并重跑，不要手改这里的任何文件。

| 项 | 值 |
| :--- | :--- |
| 上游 | `h5wasm` （npm） |
| 版本 | `0.10.3` （**钉死**：浮动版本会在没有任何提交说明的情况下改变读者浏览器里跑的东西） |
| 取自 | `npm pack h5wasm@0.10.3` 的 `dist/esm/` |
| 许可 | NIST 公共服务条款，见同目录 `LICENSE.txt`（**原样保留，不得删改**） |
| 改动 | **无**。本脚本只拷贝，不打补丁——许可里「修改过的作品应注明改了什么、何时改的」这一条因此有一个确定的答案：没有改动 |
| 内含 | HDF5 C 库（经 Emscripten 编成 wasm，以 base64 内嵌在 `hdf5_util.js` 里，故没有独立的 `.wasm`） |

| 文件 | 字节 | sha256 |
| :--- | ---: | :--- |
| `hdf5_hl.js` | 48,561 | `fe46fdd39690a348a61561d627f7d9feb81b92d805cde992cfa23866f1c1a8e1` |
| `hdf5_util.js` | 4,150,134 | `c41874d94e9523f4c7d498c951d7707f278f62040155ee8525aafce46ce1e2c8` |
| `LICENSE.txt` | 7,577 | `f3ba6b8afe2a0d6f482f29a46672f88668ae02b16dfc4a2e878fd50a4f34fa6a` |

★**为什么这几 MB 不进预缓存。** 两个 ESM 文件合计约 4.2 MB，比本仓自己的三份内核
wasm 加起来（约 1.56 MB）还大。它是**按需能力**，不是每个读者都要的东西，所以
`h5source.js` 用动态 `import()` 取它，`tools/make-sw.mjs` 把本目录排除在预缓存之外：
打开过 HDF5 的读者由 service worker 的运行时缓存留下它，没打开过的人一个字节也不下。

★**致谢是许可义务，不是客套**：NIST 条款要求「明确承认 NIST 为该软件的来源」。
这句话落在 `docs/ACKNOWLEDGEMENTS.md` 与 `app/credits.html`，不只落在这里。
