"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const PDFDocument = require('pdfkit');
const ExcelJS = __importStar(require("exceljs"));
let ReportsService = class ReportsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getProject(projectId) {
        const project = await this.prisma.project.findUnique({
            where: { id: projectId },
            include: {
                block: { include: { translations: true, files: { where: { isCover: true }, take: 1 } } },
                financialOfficer: { select: { firstName: true, lastName: true } },
                donations: { where: { status: 'approved' }, select: { amount: true } },
            },
        });
        if (!project)
            throw new common_1.NotFoundException(`Project #${projectId} not found`);
        return project;
    }
    async generateProjectSummaryPdf(projectId) {
        const project = await this.getProject(projectId);
        const name = project.block.translations[0]?.name || `Project #${projectId}`;
        const description = project.block.translations[0]?.description || '';
        const collected = project.donations.reduce((s, d) => s + Number(d.amount), 0);
        const [steps, phases, milestones] = await Promise.all([
            this.prisma.projectStep.findMany({
                where: { projectId: project.blockId },
                include: { block: { include: { translations: true } } },
            }),
            this.prisma.projectPhase.findMany({
                where: { projectId: project.blockId },
                include: { block: { include: { translations: true } } },
                orderBy: { order: 'asc' },
            }),
            this.prisma.projectMilestone.findMany({
                where: { projectId: project.blockId },
                include: { block: { include: { translations: true } } },
                orderBy: { targetDate: 'asc' },
            }),
        ]);
        return new Promise((resolve) => {
            const doc = new PDFDocument({ margin: 50 });
            const chunks = [];
            doc.on('data', (c) => chunks.push(c));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.fontSize(22).fillColor('#1e3a5f').text('Project Summary Report', { align: 'center' });
            doc.moveDown(0.5);
            doc.fontSize(16).fillColor('#000').text(name, { align: 'center' });
            doc.moveDown(1);
            doc.fontSize(12).fillColor('#333');
            doc.text(`Category: ${project.category}`);
            doc.text(`Location: ${project.location || 'N/A'}`);
            doc.text(`Target Value: $${Number(project.value).toLocaleString()}`);
            doc.text(`Collected: $${collected.toLocaleString()}`);
            doc.text(`Progress: ${Number(project.progression).toFixed(2)}%`);
            doc.text(`Status: ${project.isCompleted ? 'Completed' : 'In Progress'}`);
            doc.moveDown(1);
            if (description) {
                doc.fontSize(13).fillColor('#1e3a5f').text('Description');
                doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
                doc.moveDown(0.3);
                doc.fontSize(11).fillColor('#333').text(description);
                doc.moveDown(1);
            }
            if (phases.length) {
                doc.fontSize(13).fillColor('#1e3a5f').text('Execution Phases');
                doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
                doc.moveDown(0.3);
                phases.forEach((p, i) => {
                    const pName = p.block.translations[0]?.name || `Phase ${i + 1}`;
                    doc.fontSize(11).fillColor('#333').text(`${i + 1}. ${pName} — ${p.status} (${Number(p.progress).toFixed(0)}%)`);
                });
                doc.moveDown(1);
            }
            if (steps.length) {
                doc.fontSize(13).fillColor('#1e3a5f').text('Execution Steps');
                doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
                doc.moveDown(0.3);
                steps.forEach((s, i) => {
                    const sName = s.block.translations[0]?.name || `Step ${i + 1}`;
                    doc.fontSize(11).fillColor('#333').text(`${i + 1}. ${sName} — ${s.status} (${Number(s.progress).toFixed(0)}%)`);
                });
                doc.moveDown(1);
            }
            if (milestones.length) {
                doc.fontSize(13).fillColor('#1e3a5f').text('Milestones');
                doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
                doc.moveDown(0.3);
                milestones.forEach((m, i) => {
                    const mName = m.block.translations[0]?.name || `Milestone ${i + 1}`;
                    const target = m.targetDate ? new Date(m.targetDate).toLocaleDateString() : 'N/A';
                    doc.fontSize(11).fillColor('#333').text(`${i + 1}. ${mName} — ${m.status} (Target: ${target})`);
                });
            }
            doc.end();
        });
    }
    async generateFinancialPdf(projectId) {
        const project = await this.getProject(projectId);
        const name = project.block.translations[0]?.name || `Project #${projectId}`;
        const collected = project.donations.reduce((s, d) => s + Number(d.amount), 0);
        const [budgets, expenses, transactions] = await Promise.all([
            this.prisma.projectBudget.findMany({
                where: { projectId: project.blockId },
                include: { block: { include: { translations: true } } },
            }),
            this.prisma.projectExpense.findMany({
                where: { projectId: project.blockId },
                include: { block: { include: { translations: true } } },
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.projectTransaction.findMany({
                where: { projectId: project.blockId },
                orderBy: { createdAt: 'desc' },
            }),
        ]);
        const totalIncome = transactions.filter(t => t.type === 'income' || t.type === 'adjustment').reduce((s, t) => s + Number(t.amount), 0);
        const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
        return new Promise((resolve) => {
            const doc = new PDFDocument({ margin: 50 });
            const chunks = [];
            doc.on('data', (c) => chunks.push(c));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.fontSize(22).fillColor('#1e3a5f').text('Financial Report', { align: 'center' });
            doc.moveDown(0.5);
            doc.fontSize(16).fillColor('#000').text(name, { align: 'center' });
            doc.moveDown(1);
            doc.fontSize(12).fillColor('#333');
            doc.text(`Total Donations Collected: $${collected.toLocaleString()}`);
            doc.text(`Total Income (Ledger): $${totalIncome.toLocaleString()}`);
            doc.text(`Total Expenses: $${totalExpense.toLocaleString()}`);
            doc.text(`Net Balance: $${(totalIncome - totalExpense).toLocaleString()}`);
            doc.moveDown(1);
            if (budgets.length) {
                doc.fontSize(13).fillColor('#1e3a5f').text('Budgets');
                doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
                doc.moveDown(0.3);
                budgets.forEach((b) => {
                    const bName = b.block.translations[0]?.name || `Budget #${b.id}`;
                    doc.fontSize(11).fillColor('#333').text(`${bName}: Est. $${Number(b.estimatedAmount).toLocaleString()} | Approved: $${Number(b.approvedAmount ?? 0).toLocaleString()} | Spent: $${Number(b.actualAmount).toLocaleString()}`);
                });
                doc.moveDown(1);
            }
            if (expenses.length) {
                doc.fontSize(13).fillColor('#1e3a5f').text('Expenses');
                doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
                doc.moveDown(0.3);
                expenses.forEach((e) => {
                    const eName = e.block.translations[0]?.name || `Expense #${e.id}`;
                    doc.fontSize(11).fillColor('#333').text(`${eName}: $${Number(e.amount).toLocaleString()} — ${e.status} (Ref: ${e.invoiceRef || 'N/A'})`);
                });
                doc.moveDown(1);
            }
            if (transactions.length) {
                doc.fontSize(13).fillColor('#1e3a5f').text('Transaction Ledger');
                doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
                doc.moveDown(0.3);
                transactions.forEach((t) => {
                    const date = new Date(t.createdAt).toLocaleDateString();
                    doc.fontSize(11).fillColor('#333').text(`[${date}] ${t.type.toUpperCase()} — $${Number(t.amount).toLocaleString()} ${t.notes ? `(${t.notes})` : ''}`);
                });
            }
            doc.end();
        });
    }
    async generateProgressPdf(projectId) {
        const project = await this.getProject(projectId);
        const name = project.block.translations[0]?.name || `Project #${projectId}`;
        const [steps, phases, tasks, milestones] = await Promise.all([
            this.prisma.projectStep.findMany({ where: { projectId: project.blockId }, include: { block: { include: { translations: true } } } }),
            this.prisma.projectPhase.findMany({ where: { projectId: project.blockId }, include: { block: { include: { translations: true } } }, orderBy: { order: 'asc' } }),
            this.prisma.projectTask.findMany({ where: { projectId: project.blockId }, include: { block: { include: { translations: true } } } }),
            this.prisma.projectMilestone.findMany({ where: { projectId: project.blockId }, include: { block: { include: { translations: true } } }, orderBy: { targetDate: 'asc' } }),
        ]);
        return new Promise((resolve) => {
            const doc = new PDFDocument({ margin: 50 });
            const chunks = [];
            doc.on('data', (c) => chunks.push(c));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.fontSize(22).fillColor('#1e3a5f').text('Progress Report', { align: 'center' });
            doc.moveDown(0.5);
            doc.fontSize(16).fillColor('#000').text(name, { align: 'center' });
            doc.moveDown(1);
            doc.fontSize(12).fillColor('#333').text(`Overall Progress: ${Number(project.progression).toFixed(2)}%`);
            doc.moveDown(1);
            const printSection = (title, items, getLabel) => {
                if (!items.length)
                    return;
                doc.fontSize(13).fillColor('#1e3a5f').text(title);
                doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
                doc.moveDown(0.3);
                items.forEach((item, idx) => {
                    doc.fontSize(11).fillColor('#333').text(`${idx + 1}. ${getLabel(item)}`);
                });
                doc.moveDown(1);
            };
            printSection('Phases', phases, (p) => `${p.block.translations[0]?.name || `Phase #${p.id}`} — ${p.status} (${Number(p.progress).toFixed(0)}%)`);
            printSection('Steps', steps, (s) => `${s.block.translations[0]?.name || `Step #${s.id}`} — ${s.status} (${Number(s.progress).toFixed(0)}%)`);
            printSection('Tasks', tasks, (t) => `${t.block.translations[0]?.name || `Task #${t.id}`} — ${t.status}`);
            printSection('Milestones', milestones, (m) => {
                const target = m.targetDate ? new Date(m.targetDate).toLocaleDateString() : 'N/A';
                return `${m.block.translations[0]?.name || `Milestone #${m.id}`} — ${m.status} (Target: ${target})`;
            });
            doc.end();
        });
    }
    async generateFinancialExcel(projectId) {
        const project = await this.getProject(projectId);
        const [transactions, expenses, budgets] = await Promise.all([
            this.prisma.projectTransaction.findMany({ where: { projectId: project.blockId }, orderBy: { createdAt: 'desc' } }),
            this.prisma.projectExpense.findMany({ where: { projectId: project.blockId }, include: { block: { include: { translations: true } } }, orderBy: { createdAt: 'desc' } }),
            this.prisma.projectBudget.findMany({ where: { projectId: project.blockId }, include: { block: { include: { translations: true } } } }),
        ]);
        const wb = new ExcelJS.Workbook();
        wb.creator = 'HelpingHands';
        const txSheet = wb.addWorksheet('Transactions');
        txSheet.columns = [
            { header: 'ID', key: 'id', width: 8 },
            { header: 'Type', key: 'type', width: 14 },
            { header: 'Amount', key: 'amount', width: 14 },
            { header: 'Reference', key: 'ref', width: 20 },
            { header: 'Notes', key: 'notes', width: 30 },
            { header: 'Date', key: 'date', width: 16 },
        ];
        transactions.forEach((t) => txSheet.addRow({ id: t.id, type: t.type, amount: Number(t.amount), ref: t.referenceType ? `${t.referenceType}#${t.referenceId}` : '', notes: t.notes || '', date: new Date(t.createdAt).toLocaleDateString() }));
        const bSheet = wb.addWorksheet('Budgets');
        bSheet.columns = [
            { header: 'ID', key: 'id', width: 8 },
            { header: 'Name', key: 'name', width: 30 },
            { header: 'Estimated', key: 'estimated', width: 14 },
            { header: 'Approved', key: 'approved', width: 14 },
            { header: 'Actual Spent', key: 'actual', width: 14 },
        ];
        budgets.forEach((b) => bSheet.addRow({ id: b.id, name: b.block.translations[0]?.name || `Budget #${b.id}`, estimated: Number(b.estimatedAmount), approved: Number(b.approvedAmount ?? 0), actual: Number(b.actualAmount) }));
        const eSheet = wb.addWorksheet('Expenses');
        eSheet.columns = [
            { header: 'ID', key: 'id', width: 8 },
            { header: 'Name', key: 'name', width: 30 },
            { header: 'Amount', key: 'amount', width: 14 },
            { header: 'Status', key: 'status', width: 12 },
            { header: 'Invoice Ref', key: 'invoice', width: 20 },
            { header: 'Date', key: 'date', width: 16 },
        ];
        expenses.forEach((e) => eSheet.addRow({ id: e.id, name: e.block.translations[0]?.name || `Expense #${e.id}`, amount: Number(e.amount), status: e.status, invoice: e.invoiceRef || '', date: new Date(e.createdAt).toLocaleDateString() }));
        return wb.xlsx.writeBuffer();
    }
    async generateDonationsExcel(projectId) {
        const project = await this.getProject(projectId);
        const donations = await this.prisma.projectDonation.findMany({
            where: { projectId },
            include: { participant: { include: { user: { select: { email: true } } } } },
            orderBy: { createdAt: 'desc' },
        });
        const wb = new ExcelJS.Workbook();
        const sheet = wb.addWorksheet('Donations');
        sheet.columns = [
            { header: 'ID', key: 'id', width: 8 },
            { header: 'Participant', key: 'participant', width: 24 },
            { header: 'Email', key: 'email', width: 28 },
            { header: 'Amount', key: 'amount', width: 14 },
            { header: 'Status', key: 'status', width: 12 },
            { header: 'Approved At', key: 'approvedAt', width: 18 },
            { header: 'Date', key: 'date', width: 16 },
        ];
        donations.forEach((d) => sheet.addRow({
            id: d.id,
            participant: `${d.participant.firstName} ${d.participant.lastName}`,
            email: d.participant.user?.email || '',
            amount: Number(d.amount),
            status: d.status,
            approvedAt: d.approvedAt ? new Date(d.approvedAt).toLocaleDateString() : '',
            date: new Date(d.createdAt).toLocaleDateString(),
        }));
        return wb.xlsx.writeBuffer();
    }
    async generateExpensesExcel(projectId) {
        const project = await this.getProject(projectId);
        const expenses = await this.prisma.projectExpense.findMany({
            where: { projectId: project.blockId },
            include: { block: { include: { translations: true } }, budget: { include: { block: { include: { translations: true } } } } },
            orderBy: { createdAt: 'desc' },
        });
        const wb = new ExcelJS.Workbook();
        const sheet = wb.addWorksheet('Expenses');
        sheet.columns = [
            { header: 'ID', key: 'id', width: 8 },
            { header: 'Name', key: 'name', width: 30 },
            { header: 'Budget', key: 'budget', width: 24 },
            { header: 'Amount', key: 'amount', width: 14 },
            { header: 'Status', key: 'status', width: 12 },
            { header: 'Invoice Ref', key: 'invoice', width: 20 },
            { header: 'Date', key: 'date', width: 16 },
        ];
        expenses.forEach((e) => sheet.addRow({
            id: e.id,
            name: e.block.translations[0]?.name || `Expense #${e.id}`,
            budget: e.budget ? (e.budget.block.translations[0]?.name || `Budget #${e.budgetId}`) : 'N/A',
            amount: Number(e.amount),
            status: e.status,
            invoice: e.invoiceRef || '',
            date: new Date(e.createdAt).toLocaleDateString(),
        }));
        return wb.xlsx.writeBuffer();
    }
};
exports.ReportsService = ReportsService;
exports.ReportsService = ReportsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ReportsService);
//# sourceMappingURL=reports.service.js.map