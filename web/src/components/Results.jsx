import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export function fmtTime(secs) {
  if (secs == null) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

const STATUS_LABEL = {
  ok: { text: '完成', cls: 'ok' },
  group_dnf: { text: '组未完成', cls: 'dnf' },
  finish_dnf: { text: '终点超时', cls: 'dnf' },
  no_start: { text: '无出发', cls: 'bad' },
  bad_start: { text: '出发异常', cls: 'bad' },
};

export default function Results() {
  const [data, setData] = useState(null);

  useEffect(() => {
    const load = () => api.results().then(setData).catch(() => setData(null));
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, []);

  if (!data) return <p className="muted">加载中…</p>;
  if (!data.configured) return <p className="muted">赛事尚未配置，请先到「关卡设置」建立关卡组与截止秒数。</p>;

  return (
    <div>
      <p className="muted">
        起点 <b>{data.startPoint}</b> · 终点 <b>{data.finishPoint}</b> · 终点截止{' '}
        <b>{data.finishCutoff}s（{fmtTime(data.finishCutoff)}）</b> · 实时修订 #{data.revision}
      </p>
      {(data.mergedStoppages || []).length > 0 && (
        <p className="muted small">
          ⏱ 统一停表并集（重叠只计一次）：
          {data.mergedStoppages.map(iv => `[${iv.start}, ${iv.end})`).join('、')}
          {' '}— 完成者净耗时已扣除与各人「出发→终点」区间的交长；关卡/终点截止仍按原始秒数判定。
        </p>
      )}
      <table className="grid">
        <thead>
          <tr>
            <th>名次</th><th>号码布</th><th>姓名</th><th>状态</th>
            <th>原始耗时</th><th>净耗时</th><th>停表扣除</th>
            <th>首个未完成 / 说明</th><th className="chain-col">最早有效链</th>
          </tr>
        </thead>
        <tbody>
          {data.results.map(r => {
            const st = STATUS_LABEL[r.status] || { text: r.status, cls: 'bad' };
            return (
              <tr key={r.bib} className={r.status === 'ok' ? '' : 'row-dnf'}>
                <td>{r.rank ?? '—'}</td>
                <td>{r.bib}</td>
                <td>{r.name || '—'}</td>
                <td><span className={`badge ${st.cls}`}>{st.text}</span></td>
                <td>{r.elapsed != null ? `${fmtTime(r.elapsed)}（${r.elapsed}s）` : '—'}</td>
                <td>{r.netElapsed != null ? <b>{`${fmtTime(r.netElapsed)}（${r.netElapsed}s）`}</b> : '—'}</td>
                <td>{r.status === 'ok' ? `${r.stoppedSecs ?? 0}s` : '—'}</td>
                <td>{r.failAt ? <><b>{r.failAt}</b>：{r.detail}</> : r.detail || '—'}</td>
                <td className="chain">
                  {r.chain.map((c, i) => (
                    <React.Fragment key={c.record_no}>
                      {i > 0 && <span className="arrow">→</span>}
                      <span className="chip" title={`记录号 ${c.record_no}，${c.seconds}s`}>
                        {c.point}<small>{c.seconds}s</small>
                      </span>
                    </React.Fragment>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small">
        规则：打卡时间相对发枪秒数须严格递增，按关卡组顺序每组在可替代点位中选最早一条；
        逆序及多余打卡不作完成依据。关卡/终点截止与有效链按<b>原始秒数</b>判定。
        完成者排名按<b>净耗时</b>（原始耗时扣除停表并集与出发→终点区间的交长），同净耗时并列同名次；
        原始耗时列保持原始终点−出发秒数不变，未完赛者无净耗时。
      </p>
    </div>
  );
}
