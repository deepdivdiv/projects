'use strict';
// 파일을 읽어 곡 목록을 만드는 작업 스레드. 메인 프로세스는 재생 중인 곡을 전달하므로 곡이 많아도 막히지 않게 따로 돌린다.
const path = require('path');
const { parentPort, workerData } = require('worker_threads');
const { ZipLibrary } = require('./zip');
const { Collector, ProbeCache } = require('./playlist');
const tags = require('./tags');

const cache = new ProbeCache(path.join(workerData.dataDir, 'tags-cache.json'));
const zips = new ZipLibrary(path.join(workerData.dataDir, 'zips'), async (stream, name, size) => tags.duration(await tags.parseStream(stream, name, size, false)));
const collector = new Collector({ zips, cache });

parentPort.on('message', async ({ id, paths }) => {
  try {
    const value = await collector.collect(paths, (done, total) => parentPort.postMessage({ progress: { done, total } }));
    parentPort.postMessage({ id, value });
  } catch (e) {
    parentPort.postMessage({ id, error: e.message });
  }
});
