import { Button } from "./primitives/button";
import { Card, SectionCard } from "./primitives/card";
import { Badge, StatusPill } from "./primitives/badge";
import { Field, Input } from "./primitives/input";
import { Select } from "./primitives/select";
import { Table, THead, TRow, TCell } from "./primitives/table";
import { MetricCard } from "./primitives/metric-card";
import { PageHeader } from "./primitives/page-header";

export function KitchenSink() {
  return (
    <div className="min-h-screen bg-page p-8 text-body">
      <PageHeader
        eyebrow="Design System"
        title="Horizon Primitives"
        description="Sapphire Clean · Crisp / Dense"
        actions={<Button>บันทึก</Button>}
      />
      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="แอปที่ใช้งาน" value="1,284" />
        <MetricCard label="Uptime" value="98.6%" />
        <MetricCard label="รออนุมัติ" value="42" />
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
      </div>
      <div className="mt-4 flex gap-2">
        <Badge tone="success">อนุมัติ</Badge>
        <Badge tone="warning">ใกล้เต็ม</Badge>
        <Badge tone="danger">ปฏิเสธ</Badge>
        <StatusPill status="healthy" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <SectionCard title="ฟอร์ม">
          <Field label="ชื่อแอป" htmlFor="ks-name" hint="ตัวอย่าง">
            <Input id="ks-name" placeholder="CRM ภายใน" />
          </Field>
          <div className="mt-3">
            <Field label="ฝ่าย" htmlFor="ks-team">
              <Select id="ks-team">
                <option>ฝ่ายขาย</option>
                <option>HR</option>
              </Select>
            </Field>
          </div>
        </SectionCard>
        <Card>
          <Table>
            <THead>
              <TRow>
                <TCell>คำขอ</TCell>
                <TCell>สถานะ</TCell>
              </TRow>
            </THead>
            <tbody>
              <TRow>
                <TCell>เผยแพร่ · CRM</TCell>
                <TCell>
                  <StatusPill status="healthy" />
                </TCell>
              </TRow>
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
