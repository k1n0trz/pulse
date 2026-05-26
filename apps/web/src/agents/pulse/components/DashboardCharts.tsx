import { Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart } from "recharts";

interface TrendPoint {
  date: string;
  spend: number;
  roas: number;
  cpa: number;
  conversions: number;
}

export function DashboardCharts({ trend, leads, sales }: { trend: TrendPoint[]; leads: number; sales: number }) {
  const objectiveData = [
    { name: "Ventas", value: sales, color: "#8B5CF6" },
    { name: "Leads", value: leads, color: "#EC4899" },
    { name: "Trafico", value: 1250, color: "#3B82F6" },
    { name: "Interaccion", value: 325, color: "#FB923C" },
    { name: "Mensajes", value: 230, color: "#22C55E" }
  ];

  return (
    <>
      <section className="panel chart-panel wide">
        <div className="panel-head">
          <h2>Inversion vs resultados</h2>
          <span>ROAS</span>
        </div>
        <ResponsiveContainer width="100%" height={245}>
          <LineChart data={trend}>
            <XAxis dataKey="date" stroke="#A1A1AA" tickLine={false} axisLine={false} />
            <YAxis yAxisId="left" stroke="#A1A1AA" tickLine={false} axisLine={false} />
            <YAxis yAxisId="right" orientation="right" stroke="#EC4899" tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: "#121025", border: "1px solid #27213f", borderRadius: 8, color: "#fff" }} />
            <Line yAxisId="left" type="monotone" dataKey="spend" stroke="#8B5CF6" strokeWidth={3} dot={{ r: 4 }} isAnimationActive={false} />
            <Line yAxisId="right" type="monotone" dataKey="roas" stroke="#EC4899" strokeWidth={3} dot={{ r: 4 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section className="panel chart-panel">
        <div className="panel-head">
          <h2>Resultados por objetivo</h2>
          <span>Mix</span>
        </div>
        <div className="donut-wrap">
          <ResponsiveContainer width="48%" height={220}>
            <PieChart>
              <Pie data={objectiveData} innerRadius={58} outerRadius={88} dataKey="value" paddingAngle={2} isAnimationActive={false}>
                {objectiveData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="legend-list">
            {objectiveData.map((entry) => (
              <p key={entry.name}><i style={{ background: entry.color }} />{entry.name}<span>{entry.value}</span></p>
            ))}
          </div>
        </div>
      </section>

      <section className="panel chart-panel small-chart">
        <div className="panel-head">
          <h2>CPA por dia</h2>
          <span>Control</span>
        </div>
        <ResponsiveContainer width="100%" height={170}>
          <AreaChart data={trend}>
            <XAxis dataKey="date" stroke="#A1A1AA" tickLine={false} axisLine={false} />
            <YAxis stroke="#A1A1AA" tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: "#121025", border: "1px solid #27213f", borderRadius: 8, color: "#fff" }} />
            <Area type="monotone" dataKey="cpa" stroke="#FACC15" fill="#facc1533" strokeWidth={3} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </section>
    </>
  );
}
