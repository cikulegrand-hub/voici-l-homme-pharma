import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  Bell,
  Camera,
  CheckCircle2,
  Boxes,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Menu,
  Package,
  Plus,
  Search,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  Store,
  Truck,
  ArrowLeft,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react';

type View = 'dashboard' | 'products' | 'stock' | 'sales' | 'clients' | 'suppliers' | 'reports';
type ProductStatus = 'En stock' | 'Stock faible' | 'Rupture';

type Product = {
  name: string;
  dci: string;
  category: string;
  lot: string;
  expiry: string;
  quantity: number;
  threshold: number;
  price: string;
  status: ProductStatus;
};

const initialProducts: Product[] = [
  { name: 'Doliprane 1000 mg', dci: 'Paracétamol', category: 'Antalgique', lot: 'DLP-2418', expiry: '12/2027', quantity: 248, threshold: 50, price: '1 200 FCFA', status: 'En stock' },
  { name: 'Amoxicilline 500 mg', dci: 'Amoxicilline', category: 'Antibiotique', lot: 'AMX-9031', expiry: '06/2026', quantity: 24, threshold: 40, price: '3 500 FCFA', status: 'Stock faible' },
  { name: 'Spasfon Lyoc', dci: 'Phloroglucinol', category: 'Digestif', lot: 'SPS-7720', expiry: '09/2026', quantity: 86, threshold: 25, price: '2 000 FCFA', status: 'En stock' },
  { name: 'Efferalgan Vit C', dci: 'Paracétamol + Vit C', category: 'Antalgique', lot: 'EFF-4412', expiry: '03/2025', quantity: 0, threshold: 30, price: '2 500 FCFA', status: 'Rupture' },
  { name: 'Maalox suspension', dci: 'Hydroxyde aluminium', category: 'Digestif', lot: 'MAX-3018', expiry: '11/2026', quantity: 61, threshold: 20, price: '2 800 FCFA', status: 'En stock' },
];

const navigation = [
  { id: 'dashboard' as View, label: 'Tableau de bord', icon: LayoutDashboard },
  { id: 'products' as View, label: 'Produits & catalogue', icon: Package },
  { id: 'stock' as View, label: 'Mouvements de stock', icon: Boxes },
  { id: 'sales' as View, label: 'Ventes & factures', icon: ShoppingCart },
  { id: 'clients' as View, label: 'Clients', icon: UserRound },
  { id: 'suppliers' as View, label: 'Fournisseurs', icon: Truck },
  { id: 'reports' as View, label: 'Rapports', icon: BarChart3 },
];

type ProductFormValues = Omit<Product, 'status'>;

type MovementFormValues = {
  productName: string;
  type: 'Entrée' | 'Sortie';
  quantity: number;
  reason: string;
};

type Movement = {
  date: string;
  productName: string;
  lot: string;
  type: 'Entrée' | 'Sortie' | 'Ajustement';
  quantity: number;
  reason: string;
  user: string;
};

type PrescriptionLine = {
  medication: string;
  quantity: number;
  unitPrice: number;
};

type DemoCustomer = {
  name: string;
  phone: string;
  company: string;
  idNumber: string;
  prescription: string;
  prescriptionItems: string;
  photoName: string;
  paymentMethod: string;
  amount: string;
  cartLines: { name: string; quantity: number }[];
};

type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  company: string;
  address: string;
  type: 'Particulier' | 'Entreprise';
  notes: string;
  registeredAt: string;
};

type Supplier = {
  id: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  category: string;
  status: 'Actif' | 'Inactif';
  notes: string;
};

type SupplierOrder = {
  id: string;
  supplierId: string;
  date: string;
  items: string;
  amount: string;
  status: 'En attente' | 'Reçue' | 'Annulée';
};

type Sale = {
  invoice: string;
  customer: string;
  items: string;
  amount: string;
  method: string;
  time: string;
};

const initialSales: Sale[] = [
  { invoice: 'FAC-002841', customer: 'Client comptoir', items: 'Doliprane 1000 mg × 2', amount: '2 400 FCFA', method: 'Espèces', time: 'Il y a 8 min' },
  { invoice: 'FAC-002840', customer: 'Mme N. Kouassi', items: 'Amoxicilline 500 mg × 1', amount: '3 500 FCFA', method: 'Mobile Money', time: 'Il y a 22 min' },
  { invoice: 'FAC-002839', customer: 'Client comptoir', items: 'Maalox suspension × 1', amount: '2 800 FCFA', method: 'Espèces', time: 'Il y a 41 min' },
];

const initialMovements: Movement[] = [
  { date: 'Aujourd’hui, 10:42', productName: 'Doliprane 1000 mg', lot: 'DLP-2418', type: 'Entrée', quantity: 240, reason: 'Réception commande', user: 'Admin Demo' },
  { date: 'Aujourd’hui, 10:18', productName: 'Spasfon Lyoc', lot: 'SPS-7720', type: 'Sortie', quantity: 2, reason: 'Vente FAC-002841', user: 'J. Kouamé' },
  { date: 'Hier, 16:31', productName: 'Amoxicilline 500 mg', lot: 'AMX-9031', type: 'Ajustement', quantity: 4, reason: 'Inventaire physique', user: 'Admin Demo' },
];

const initialCustomers: Customer[] = [
  { id: 'CLI-001', name: 'Mme N. Kouassi', phone: '+243 81 234 56 78', email: 'n.kouassi@email.cd', company: '', address: 'Av. de la Justice, Kinshasa', type: 'Particulier', notes: 'Cliente régulière, allergies aux pénicillines.', registeredAt: '12/03/2026' },
  { id: 'CLI-002', name: 'M. J. Mukendi', phone: '+243 82 456 78 90', email: 'mukendi.j@email.cd', company: 'Société Générale CD', address: 'Boulevard du 30 Juin, Kinshasa', type: 'Entreprise', notes: 'Crédit partenaire — plafond 500 000 FCFA.', registeredAt: '28/01/2026' },
  { id: 'CLI-003', name: 'Mlle A. Tshala', phone: '+243 89 678 90 12', email: '', company: '', address: 'Commune de Lemba, Kinshasa', type: 'Particulier', notes: '', registeredAt: '05/09/2026' },
  { id: 'CLI-004', name: 'Client comptoir', phone: '', email: '', company: '', address: '', type: 'Particulier', notes: 'Client de passage sans dossier.', registeredAt: '—' },
];

const initialSuppliers: Supplier[] = [
  { id: 'FRN-001', name: 'Laborex RDC', contact: 'M. K. Kabongo', phone: '+243 81 100 20 30', email: 'commandes@laborex.cd', address: 'Av. de l’Échangeur, Kinshasa', category: 'Médicaments génériques', status: 'Actif', notes: 'Délai de livraison 48h. Remise volume 5%.' },
  { id: 'FRN-002', name: 'Pharmaland Distribution', contact: 'Mme L. Bitumba', phone: '+243 82 200 40 50', email: 'info@pharmaland.cd', address: 'Industriel Boulevard, Kinshasa', category: 'Parapharmacie', status: 'Actif', notes: 'Livreur dédié le mardi et vendredi.' },
  { id: 'FRN-003', name: 'Biopharma Congo', contact: 'M. P. Tshisekedi', phone: '+243 89 300 60 70', email: 'contact@biopharma.cd', address: 'Av. Kasa-Vubu, Kinshasa', category: 'Antibiotiques', status: 'Inactif', notes: 'Suspension temporaire — relance prévue.' },
];

const initialSupplierOrders: SupplierOrder[] = [
  { id: 'CMD-001', supplierId: 'FRN-001', date: 'Aujourd’hui, 09:15', items: 'Doliprane 1000 mg × 240, Spasfon Lyoc × 100', amount: '856 000 FCFA', status: 'Reçue' },
  { id: 'CMD-002', supplierId: 'FRN-002', date: 'Hier, 14:30', items: 'Gel hydroalcoolique × 50, Masques × 200', amount: '340 000 FCFA', status: 'En attente' },
  { id: 'CMD-003', supplierId: 'FRN-001', date: '09/10/2026', items: 'Amoxicilline 500 mg × 120', amount: '420 000 FCFA', status: 'En attente' },
  { id: 'CMD-004', supplierId: 'FRN-003', date: '02/10/2026', items: 'Coton hydrophile × 80', amount: '96 000 FCFA', status: 'Annulée' },
];

const DEMO_DURATION = 15 * 60;

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function parsePrice(price: string): number {
  return Number(price.replace(/[^\d]/g, ''));
}

function App() {
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSalePanel, setShowSalePanel] = useState(false);
  const [notice, setNotice] = useState('');
  const [demoSales, setDemoSales] = useState<Sale[]>(initialSales);
  const [demoCustomers, setDemoCustomers] = useState<DemoCustomer[]>([]);
  const [demoProducts, setDemoProducts] = useState<Product[]>(initialProducts);
  const [demoMovements, setDemoMovements] = useState<Movement[]>(initialMovements);
  const [showProductForm, setShowProductForm] = useState(false);
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(DEMO_DURATION);
  const [demoClients, setDemoClients] = useState<Customer[]>(initialCustomers);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [demoSuppliers, setDemoSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [demoSupplierOrders, setDemoSupplierOrders] = useState<SupplierOrder[]>(initialSupplierOrders);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);

  const filteredProducts = useMemo(
    () => demoProducts.filter((product) => `${product.name} ${product.dci} ${product.lot}`.toLowerCase().includes(searchTerm.toLowerCase())),
    [demoProducts, searchTerm]
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSessionSeconds((remaining) => {
        if (remaining <= 1) {
          setDemoSales(initialSales);
          setDemoCustomers([]);
          setDemoProducts(initialProducts);
          setDemoMovements(initialMovements);
          setDemoClients(initialCustomers);
          setDemoSuppliers(initialSuppliers);
          setDemoSupplierOrders(initialSupplierOrders);
          return DEMO_DURATION;
        }
        return remaining - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const selectView = (view: View) => {
    setActiveView(view);
    setSidebarOpen(false);
  };

  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2800);
  };

  const resetDemo = () => {
    setDemoSales(initialSales);
    setDemoCustomers([]);
    setDemoProducts(initialProducts);
    setDemoMovements(initialMovements);
    setDemoClients(initialCustomers);
    setSessionSeconds(DEMO_DURATION);
    setShowSalePanel(false);
    setShowProductForm(false);
    setShowMovementForm(false);
    setShowCustomerForm(false);
    setEditingCustomer(null);
    setSelectedCustomerId(null);
    setDemoSuppliers(initialSuppliers);
    setDemoSupplierOrders(initialSupplierOrders);
    setShowSupplierForm(false);
    setEditingSupplier(null);
    setSelectedSupplierId(null);
    notify('La démonstration a été remise à zéro.');
  };

  const registerDemoProduct = (values: ProductFormValues) => {
    const quantity = Number(values.quantity);
    const product: Product = { ...values, quantity, status: quantity === 0 ? 'Rupture' : quantity <= values.threshold ? 'Stock faible' : 'En stock' };
    setDemoProducts((currentProducts) => [product, ...currentProducts]);
    setShowProductForm(false);
    notify('Produit ajouté au catalogue de démonstration.');
  };

  const registerDemoMovement = (values: MovementFormValues) => {
    const matchedProduct = demoProducts.find((p) => p.name === values.productName);
    setDemoProducts((currentProducts) => currentProducts.map((product) => {
      if (product.name !== values.productName) return product;
      const quantity = Math.max(0, product.quantity + (values.type === 'Entrée' ? values.quantity : -values.quantity));
      return { ...product, quantity, status: quantity === 0 ? 'Rupture' : quantity <= product.threshold ? 'Stock faible' : 'En stock' };
    }));
    setDemoMovements((currentMovements) => [{
      date: 'À l’instant',
      productName: values.productName,
      lot: matchedProduct?.lot ?? '',
      type: values.reason === 'Inventaire physique' ? 'Ajustement' : values.type,
      quantity: values.quantity,
      reason: values.reason,
      user: 'Admin Demo',
    }, ...currentMovements]);
    setShowMovementForm(false);
    notify(`${values.type} enregistrée pour ${values.productName} · ${values.reason}.`);
  };

  const registerDemoSale = (customer: DemoCustomer) => {
    setDemoCustomers((currentCustomers) => [...currentCustomers, customer]);
    setDemoSales((currentSales) => [
      { invoice: `FAC-00${2842 + currentSales.length}`, customer: customer.name, items: customer.prescriptionItems, amount: customer.amount, method: customer.paymentMethod, time: 'À l’instant' },
      ...currentSales,
    ]);
    setDemoProducts((currentProducts) => currentProducts.map((product) => {
      const cartLine = customer.cartLines.find((line) => line.name === product.name);
      if (!cartLine || cartLine.quantity <= 0) return product;
      const quantity = Math.max(0, product.quantity - cartLine.quantity);
      return { ...product, quantity, status: quantity === 0 ? 'Rupture' : quantity <= product.threshold ? 'Stock faible' : 'En stock' };
    }));
    const totalCartQty = customer.cartLines.reduce((sum, line) => sum + line.quantity, 0);
    setDemoMovements((currentMovements) => [{
      date: 'À l’instant',
      productName: customer.prescriptionItems,
      lot: '',
      type: 'Sortie',
      quantity: totalCartQty,
      reason: 'Vente comptoir',
      user: 'Admin Demo',
    }, ...currentMovements]);
    setShowSalePanel(false);
    notify(`Facture simulée créée pour ${customer.name}.`);
  };

  const registerDemoCustomer = (values: Omit<Customer, 'id' | 'registeredAt'>) => {
    if (editingCustomer) {
      setDemoClients((current) => current.map((c) => c.id === editingCustomer.id ? { ...c, ...values } : c));
      setEditingCustomer(null);
      setShowCustomerForm(false);
      notify('Client mis à jour avec succès.');
    } else {
      const newCustomer: Customer = { ...values, id: `CLI-${String(demoClients.length + 1).padStart(3, '0')}`, registeredAt: 'Aujourd’hui' };
      setDemoClients((current) => [newCustomer, ...current]);
      setShowCustomerForm(false);
      notify('Nouveau client enregistré.');
    }
  };

  const deleteDemoCustomer = (id: string) => {
    setDemoClients((current) => current.filter((c) => c.id !== id));
    setSelectedCustomerId(null);
    notify('Client supprimé.');
  };

  const startEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setShowCustomerForm(true);
  };

  const registerDemoSupplier = (values: Omit<Supplier, 'id'>) => {
    if (editingSupplier) {
      setDemoSuppliers((current) => current.map((s) => s.id === editingSupplier.id ? { ...s, ...values } : s));
      setEditingSupplier(null);
      setShowSupplierForm(false);
      notify('Fournisseur mis à jour avec succès.');
    } else {
      const newSupplier: Supplier = { ...values, id: `FRN-${String(demoSuppliers.length + 1).padStart(3, '0')}` };
      setDemoSuppliers((current) => [newSupplier, ...current]);
      setShowSupplierForm(false);
      notify('Nouveau fournisseur enregistré.');
    }
  };

  const deleteDemoSupplier = (id: string) => {
    setDemoSuppliers((current) => current.filter((s) => s.id !== id));
    setSelectedSupplierId(null);
    notify('Fournisseur supprimé.');
  };

  const startEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setShowSupplierForm(true);
  };

  const updateOrderStatus = (orderId: string, status: SupplierOrder['status']) => {
    setDemoSupplierOrders((current) => current.map((o) => o.id === orderId ? { ...o, status } : o));
    notify(`Commande ${orderId} marquée « ${status} ».`);
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-block">
          <div className="brand-mark"><Plus size={22} strokeWidth={3} /></div>
          <div>
            <strong>Voici l’Homme</strong>
            <span>PHARMA</span>
          </div>
          <button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Fermer le menu"><X size={18} /></button>
        </div>
        <div className="pharmacy-switcher">
          <div className="pharmacy-icon"><Store size={17} /></div>
          <div><span>Officine principale</span><strong>Kinshasa · Limete</strong></div>
          <ChevronDown size={15} />
        </div>
        <div className="nav-label">GESTION</div>
        <nav className="main-nav">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${activeView === id ? 'active' : ''}`} onClick={() => selectView(id)}>
              <Icon size={18} /><span>{label}</span>{id === 'stock' && <em>{demoMovements.length}</em>}
            </button>
          ))}
        </nav>
        <div className="nav-label nav-label-bottom">ADMINISTRATION</div>
        <nav className="main-nav">
          <button className="nav-item" onClick={() => notify('La gestion des utilisateurs sera disponible dans la version connectée.')}><Users size={18} /><span>Utilisateurs</span></button>
          <button className="nav-item" onClick={() => notify('Les paramètres sont prêts pour la configuration finale.')}><Settings size={18} /><span>Paramètres</span></button>
        </nav>
        <div className="sidebar-footer">
          <div className="secure-badge"><span className="status-dot" /> Démonstration temporaire</div>
          <div className="user-profile"><div className="avatar">AD</div><div><strong>Admin Demo</strong><span>Propriétaire</span></div><ChevronDown size={15} /></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="icon-button menu-toggle" onClick={() => setSidebarOpen(true)} aria-label="Ouvrir le menu"><Menu size={22} /></button>
          <div className="breadcrumb"><span>Voici l’Homme Pharma</span><span className="breadcrumb-separator">/</span><strong>{navigation.find((item) => item.id === activeView)?.label}</strong></div>
          <div className="topbar-actions"><button className="icon-button notification-button" onClick={() => notify('Vous avez 3 alertes de stock à consulter.')}><Bell size={19} /><i /></button><div className="topbar-divider" /><div className="topbar-user"><div className="avatar avatar-small">AD</div><span>Admin Demo</span><ChevronDown size={15} /></div></div>
        </header>

        <div className="page-content">
          <div className="demo-session"><div className="demo-session-copy"><span className="demo-live-dot" /><div><strong>Session de démonstration active</strong><span>Les ventes ajoutées sont temporaires et s’effacent automatiquement.</span></div></div><div className="demo-session-actions"><strong>{formatDuration(sessionSeconds)}</strong><button onClick={resetDemo}>Réinitialiser</button></div></div>
          {activeView === 'dashboard' && <Dashboard salesData={demoSales} products={demoProducts} onNavigate={selectView} onNewSale={() => setShowSalePanel(true)} />}
          {activeView === 'products' && <ProductsView products={filteredProducts} totalCount={demoProducts.length} alertCount={demoProducts.filter((p) => p.status !== 'En stock').length} searchTerm={searchTerm} setSearchTerm={setSearchTerm} onAdd={() => setShowProductForm(true)} onProductDetail={(name) => notify(`Détail du produit « ${name} » — disponible dans la version connectée.`)} onFilter={() => notify('Filtres avancés à venir dans la version connectée.')} onExport={() => notify('Export CSV généré pour la démonstration.')} />}
          {activeView === 'stock' && <StockView movements={demoMovements} onAction={() => setShowMovementForm(true)} />}
          {activeView === 'sales' && <SalesView salesData={demoSales} customers={demoCustomers} customerCount={demoCustomers.length} onNewSale={() => setShowSalePanel(true)} onSaleDetail={(invoice) => notify(`Détail de la facture ${invoice} — disponible dans la version connectée.`)} />}
          {activeView === 'clients' && <ClientsView clients={demoClients} salesData={demoSales} onAdd={() => { setEditingCustomer(null); setShowCustomerForm(true); }} onEdit={startEditCustomer} onDetail={(id) => setSelectedCustomerId(id)} />}
          {activeView === 'suppliers' && <SuppliersView suppliers={demoSuppliers} orders={demoSupplierOrders} onAdd={() => { setEditingSupplier(null); setShowSupplierForm(true); }} onEdit={startEditSupplier} onDetail={(id) => setSelectedSupplierId(id)} onOrderStatus={updateOrderStatus} />}
          {activeView === 'reports' && <ReportsView salesData={demoSales} products={demoProducts} onExport={() => notify('Rapport exporté pour la démonstration.')} />}
        </div>
      </main>

      {showSalePanel && <QuickSalePanel products={demoProducts} onClose={() => setShowSalePanel(false)} onComplete={registerDemoSale} />}
      {showProductForm && <ProductForm onClose={() => setShowProductForm(false)} onSubmit={registerDemoProduct} />}
      {showMovementForm && <MovementForm products={demoProducts} onClose={() => setShowMovementForm(false)} onSubmit={registerDemoMovement} />}
      {showCustomerForm && <CustomerForm customer={editingCustomer} onClose={() => { setShowCustomerForm(false); setEditingCustomer(null); }} onSubmit={registerDemoCustomer} />}
      {selectedCustomerId && <CustomerDetail customer={demoClients.find((c) => c.id === selectedCustomerId)!} salesData={demoSales.filter((s) => s.customer === (demoClients.find((c) => c.id === selectedCustomerId)?.name ?? ''))} onClose={() => setSelectedCustomerId(null)} onEdit={(c) => { setSelectedCustomerId(null); startEditCustomer(c); }} onDelete={deleteDemoCustomer} />}
      {showSupplierForm && <SupplierForm supplier={editingSupplier} onClose={() => { setShowSupplierForm(false); setEditingSupplier(null); }} onSubmit={registerDemoSupplier} />}
      {selectedSupplierId && <SupplierDetail supplier={demoSuppliers.find((s) => s.id === selectedSupplierId)!} orders={demoSupplierOrders.filter((o) => o.supplierId === selectedSupplierId)} onClose={() => setSelectedSupplierId(null)} onEdit={(s) => { setSelectedSupplierId(null); startEditSupplier(s); }} onDelete={deleteDemoSupplier} onOrderStatus={updateOrderStatus} />}
      {notice && <div className="toast"><span className="toast-check">✓</span>{notice}</div>}
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function Dashboard({ salesData, products, onNavigate, onNewSale }: { salesData: Sale[]; products: Product[]; onNavigate: (view: View) => void; onNewSale: () => void }) {
  const extraSales = Math.max(0, salesData.length - initialSales.length);
  const sessionRevenue = salesData.slice(initialSales.length).reduce((sum, sale) => sum + parsePrice(sale.amount), 0);
  const totalCA = 248600 + sessionRevenue;
  const totalVentes = 42 + extraSales;
  const stockValue = products.reduce((sum, p) => sum + p.quantity * parsePrice(p.price), 0);
  const alertProducts = products.filter((p) => p.status !== 'En stock');

  return <>
    <PageHeading eyebrow="Mardi 14 octobre 2026" title="Bonjour, Admin" description="Voici ce qui se passe dans votre officine aujourd’hui." action={<button className="primary-button" onClick={onNewSale}><Plus size={18} /> Nouvelle vente</button>} />
    <div className="kpi-grid">
      <KpiCard label="Chiffre d’affaires" value={`${totalCA.toLocaleString('fr-FR')} FCFA`} detail={extraSales > 0 ? `+${sessionRevenue.toLocaleString('fr-FR')} FCFA` : '+12,8%'} comparison="vs. hier" icon={CircleDollarSign} tone="green" />
      <KpiCard label="Ventes du jour" value={String(totalVentes)} detail={`+${8 + extraSales}`} comparison="vs. hier" icon={ShoppingCart} tone="blue" />
      <KpiCard label="Valeur du stock" value={`${(stockValue / 1_000_000).toFixed(1).replace('.', ',')} M FCFA`} detail="+2,4%" comparison="ce mois" icon={Package} tone="amber" />
      <KpiCard label="Alertes à traiter" value={String(alertProducts.length)} detail="À vérifier" comparison="maintenant" icon={AlertTriangle} tone="red" />
    </div>
    <div className="dashboard-grid">
      <section className="panel sales-chart-panel"><div className="panel-heading"><div><h2>Évolution des ventes</h2><p>Chiffre d’affaires sur les 7 derniers jours</p></div><button className="select-button">Cette semaine <ChevronDown size={14} /></button></div><div className="chart-summary"><strong>{totalCA.toLocaleString('fr-FR')} <small>FCFA</small></strong><span className="positive"><ArrowUpRight size={15} /> {extraSales > 0 ? `+${sessionRevenue.toLocaleString('fr-FR')}` : '14,6%'}</span></div><div className="chart"><div className="chart-y"><span>300k</span><span>200k</span><span>100k</span><span>0</span></div><div className="chart-area"><div className="grid-line line-1" /><div className="grid-line line-2" /><div className="grid-line line-3" /><svg viewBox="0 0 640 190" preserveAspectRatio="none" aria-label="Graphique simulé des ventes"><defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#2e9c75" stopOpacity=".25" /><stop offset="100%" stopColor="#2e9c75" stopOpacity="0" /></linearGradient></defs><path d="M0 142 C35 135 50 145 82 113 S125 120 153 96 S195 112 220 79 S255 104 290 71 S325 76 350 93 S390 58 420 69 S460 70 485 43 S530 51 555 27 S610 42 640 12 V190 H0 Z" fill="url(#area)" /><path d="M0 142 C35 135 50 145 82 113 S125 120 153 96 S195 112 220 79 S255 104 290 71 S325 76 350 93 S390 58 420 69 S460 70 485 43 S530 51 555 27 S610 42 640 12" fill="none" stroke="#2e9c75" strokeWidth="3" strokeLinecap="round" /></svg><div className="chart-x"><span>Lun 08</span><span>Mar 09</span><span>Mer 10</span><span>Jeu 11</span><span>Ven 12</span><span>Sam 13</span><span>Dim 14</span></div></div></div></section>
      <section className="panel alerts-panel"><div className="panel-heading"><div><h2>À surveiller</h2><p>Actions prioritaires</p></div><button className="text-button" onClick={() => onNavigate('stock')}>Tout voir <ArrowUpRight size={15} /></button></div><div className="alert-list">{alertProducts.length === 0 ? <div className="alert-row"><div className="alert-icon green"><CheckCircle2 size={16} /></div><div><strong>Aucune alerte</strong><span>Tout le stock est au niveau normal</span></div></div> : alertProducts.slice(0, 4).map((p) => <AlertRow key={p.name} icon={p.status === 'Rupture' ? AlertTriangle : Bell} tone={p.status === 'Rupture' ? 'red' : 'amber'} title={p.status === 'Rupture' ? 'Rupture de stock' : 'Stock faible'} text={p.name} meta={p.status === 'Rupture' ? '0 unité disponible' : `${p.quantity} unités restantes`} />)}</div><button className="outline-button full-button" onClick={() => onNavigate('stock')}>Gérer les alertes <ArrowUpRight size={15} /></button></section>
    </div>
    <div className="dashboard-grid bottom-grid"><section className="panel"><div className="panel-heading"><div><h2>Dernières ventes</h2><p>Les transactions les plus récentes</p></div><button className="text-button" onClick={() => onNavigate('sales')}>Voir toutes les ventes <ArrowUpRight size={15} /></button></div><SalesTable salesData={salesData} compact /></section><section className="panel top-products"><div className="panel-heading"><div><h2>Produits les plus vendus</h2><p>Cette semaine</p></div><button className="icon-button"><SlidersHorizontal size={17} /></button></div><div className="product-rank"><span className="rank">01</span><div className="product-mini-icon blue-soft"><Package size={17} /></div><div className="rank-detail"><strong>Doliprane 1000 mg</strong><span>128 unités vendues</span></div><strong className="rank-value">153 600</strong></div><div className="product-rank"><span className="rank">02</span><div className="product-mini-icon green-soft"><Package size={17} /></div><div className="rank-detail"><strong>Spasfon Lyoc</strong><span>86 unités vendues</span></div><strong className="rank-value">172 000</strong></div><div className="product-rank"><span className="rank">03</span><div className="product-mini-icon amber-soft"><Package size={17} /></div><div className="rank-detail"><strong>Maalox suspension</strong><span>61 unités vendues</span></div><strong className="rank-value">170 800</strong></div></section></div>
  </>;
}

function KpiCard({ label, value, detail, comparison, icon: Icon, tone }: { label: string; value: string; detail: string; comparison: string; icon: typeof CircleDollarSign; tone: string }) { return <div className="kpi-card"><div className={`kpi-icon ${tone}`}><Icon size={19} /></div><span className="kpi-label">{label}</span><strong className="kpi-value">{value}</strong><div className="kpi-detail"><span className={tone === 'red' ? 'attention' : 'positive'}>{detail}</span><span>{comparison}</span></div></div>; }
function AlertRow({ icon: Icon, tone, title, text, meta }: { icon: typeof AlertTriangle; tone: string; title: string; text: string; meta: string }) { return <div className="alert-row"><div className={`alert-icon ${tone}`}><Icon size={16} /></div><div><strong>{title}</strong><span>{text}</span><small>{meta}</small></div><ArrowUpRight size={15} className="row-arrow" /></div>; }

function ProductsView({ products: visibleProducts, totalCount, alertCount, searchTerm, setSearchTerm, onAdd, onProductDetail, onFilter, onExport }: { products: Product[]; totalCount: number; alertCount: number; searchTerm: string; setSearchTerm: (value: string) => void; onAdd: () => void; onProductDetail: (name: string) => void; onFilter: () => void; onExport: () => void }) {
  return <><PageHeading eyebrow="Catalogue officine" title="Produits & catalogue" description="Gérez les produits, les lots et les seuils d’alerte." action={<button className="primary-button" onClick={onAdd}><Plus size={18} /> Ajouter un produit</button>} /><div className="stats-strip"><div><Package size={18} /><span><strong>{totalCount}</strong> produits actifs</span></div><div><AlertTriangle size={18} /><span><strong>{alertCount}</strong> alertes stock</span></div><div><ClipboardList size={18} /><span><strong>8</strong> lots proches de la péremption</span></div></div><section className="panel table-panel"><div className="table-toolbar"><div className="search-field"><Search size={17} /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Rechercher un produit, DCI ou lot..." /></div><button className="outline-button" onClick={onFilter}><SlidersHorizontal size={16} /> Filtrer</button><button className="outline-button" onClick={onExport}><ArrowDownToLine size={16} /> Exporter</button></div><div className="table-wrap"><table><thead><tr><th>Produit</th><th>Catégorie</th><th>Lot / péremption</th><th>Stock disponible</th><th>Prix de vente</th><th>Statut</th><th /></tr></thead><tbody>{visibleProducts.map((product) => <tr key={product.name}><td><div className="product-cell"><div className="product-table-icon"><Package size={17} /></div><div><strong>{product.name}</strong><span>{product.dci}</span></div></div></td><td>{product.category}</td><td><strong>{product.lot}</strong><span className="table-subtext">Expire {product.expiry}</span></td><td><strong>{product.quantity}</strong><span className="table-subtext">seuil : {product.threshold}</span></td><td>{product.price}</td><td><span className={`status-pill ${product.status === 'En stock' ? 'success' : product.status === 'Stock faible' ? 'warning' : 'danger'}`}><i />{product.status}</span></td><td><button className="more-button" onClick={() => onProductDetail(product.name)}>•••</button></td></tr>)}</tbody></table></div></section></>;
}

function StockView({ movements, onAction }: { movements: Movement[]; onAction: () => void }) {
  const entries = movements.filter((m) => m.type === 'Entrée').reduce((sum, m) => sum + m.quantity, 0);
  const exits = movements.filter((m) => m.type === 'Sortie').reduce((sum, m) => sum + m.quantity, 0);
  return <><PageHeading eyebrow="Traçabilité & inventaire" title="Mouvements de stock" description="Suivez les entrées, sorties et ajustements par lot." action={<button className="primary-button" onClick={onAction}><Plus size={18} /> Nouveau mouvement</button>} /><div className="movement-cards"><div className="movement-card"><div className="movement-card-icon green-soft"><ArrowDownToLine size={20} /></div><span>Entrées ce mois</span><strong>+ {entries}</strong><small>unités réceptionnées</small></div><div className="movement-card"><div className="movement-card-icon blue-soft"><ArrowUpRight size={20} /></div><span>Sorties ce mois</span><strong>- {exits}</strong><small>unités vendues</small></div><div className="movement-card"><div className="movement-card-icon amber-soft"><Truck size={20} /></div><span>Réceptions en attente</span><strong>04</strong><small>commandes fournisseurs</small></div></div><section className="panel table-panel"><div className="panel-heading"><div><h2>Journal des mouvements</h2><p>Historique récent des opérations de stock</p></div><button className="select-button">Tous les mouvements <ChevronDown size={14} /></button></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Produit / lot</th><th>Type</th><th>Quantité</th><th>Motif</th><th>Utilisateur</th></tr></thead><tbody>{movements.map((m, i) => <tr key={i}><td>{m.date}</td><td><strong>{m.productName}</strong>{m.lot && <span className="table-subtext">Lot {m.lot}</span>}</td><td><span className={`movement-type ${m.type === 'Entrée' ? 'entry' : m.type === 'Sortie' ? 'exit' : 'adjust'}`}>{m.type === 'Entrée' ? <ArrowDownToLine size={14} /> : m.type === 'Sortie' ? <ArrowUpRight size={14} /> : <SlidersHorizontal size={14} />} {m.type}</span></td><td><strong>{m.type === 'Entrée' ? '+ ' : '- '}{m.quantity}</strong></td><td>{m.reason}</td><td>{m.user}</td></tr>)}</tbody></table></div></section></>;
}

function SalesView({ salesData, customers, customerCount, onNewSale, onSaleDetail }: { salesData: Sale[]; customers: DemoCustomer[]; customerCount: number; onNewSale: () => void; onSaleDetail: (invoice: string) => void }) {
  const extraSales = Math.max(0, salesData.length - initialSales.length);
  const sessionRevenue = salesData.slice(initialSales.length).reduce((sum, sale) => sum + parsePrice(sale.amount), 0);
  const totalCA = 248600 + sessionRevenue;
  const totalVentes = 42 + extraSales;
  const panierMoyen = Math.round(totalCA / totalVentes);
  return <><PageHeading eyebrow="Point de vente" title="Ventes & factures" description="Retrouvez les ventes et suivez les encaissements." action={<button className="primary-button" onClick={onNewSale}><Plus size={18} /> Nouvelle vente</button>} /><div className="sales-summary"><div className="summary-card"><span>CA aujourd’hui</span><strong>{totalCA.toLocaleString('fr-FR')} FCFA</strong><small className="positive">+12,8% vs hier</small></div><div className="summary-card"><span>Transactions</span><strong>{totalVentes}</strong><small>Panier moyen : {panierMoyen.toLocaleString('fr-FR')} FCFA</small></div><div className="summary-card"><span>Clients enregistrés</span><strong>{customerCount}</strong><small>Dans cette session</small></div></div><section className="panel table-panel"><div className="panel-heading"><div><h2>Historique des ventes</h2><p>Les transactions de votre officine</p></div><div className="date-filter">14 oct. 2026 <ChevronDown size={14} /></div></div><SalesTable salesData={salesData} onDetail={onSaleDetail} /></section>{customers.length > 0 && <section className="panel table-panel"><div className="panel-heading"><div><h2>Clients de la session</h2><p>Les clients enregistrés pendant cette démonstration</p></div></div><div className="table-wrap"><table><thead><tr><th>Nom</th><th>Téléphone</th><th>Entreprise</th><th>Pièce / réf.</th><th>Ordonnance</th><th>Articles</th><th>Montant</th><th>Paiement</th></tr></thead><tbody>{customers.map((c, i) => <tr key={i}><td><strong>{c.name}</strong></td><td>{c.phone}</td><td>{c.company || '—'}</td><td>{c.idNumber || '—'}</td><td>{c.prescription}</td><td>{c.prescriptionItems}</td><td><strong>{c.amount}</strong></td><td><span className="payment-badge">{c.paymentMethod}</span></td></tr>)}</tbody></table></div></section>}</>;
}

function SalesTable({ salesData, compact = false, onDetail }: { salesData: Sale[]; compact?: boolean; onDetail?: (invoice: string) => void }) { return <div className="table-wrap"><table><thead><tr><th>Facture</th><th>Client</th><th>Articles</th><th>Montant</th><th>Paiement</th><th>Heure</th><th /></tr></thead><tbody>{salesData.slice(0, compact ? 3 : salesData.length).map((sale) => <tr key={sale.invoice}><td><strong className="invoice-number">{sale.invoice}</strong></td><td>{sale.customer}</td><td>{sale.items}</td><td><strong>{sale.amount}</strong></td><td><span className="payment-badge">{sale.method}</span></td><td>{sale.time}</td><td><button className="more-button" onClick={() => onDetail?.(sale.invoice)}>•••</button></td></tr>)}</tbody></table></div>; }

function ReportsView({ salesData, products, onExport }: { salesData: Sale[]; products: Product[]; onExport: () => void }) {
  const sessionRevenue = salesData.slice(initialSales.length).reduce((sum, sale) => sum + parsePrice(sale.amount), 0);
  const monthlyCA = 6842500 + sessionRevenue;
  const stockValue = products.reduce((sum, p) => sum + p.quantity * parsePrice(p.price), 0);
  const stockMillions = (stockValue / 1_000_000).toFixed(1).replace('.', ',');
  const progressPercent = Math.min(100, Math.round((monthlyCA / 9_500_000) * 100));
  const categoryTotals = products.reduce<Record<string, number>>((acc, p) => {
    const value = p.quantity * parsePrice(p.price);
    acc[p.category] = (acc[p.category] ?? 0) + value;
    return acc;
  }, {});
  const totalStockValue = Object.values(categoryTotals).reduce((sum, v) => sum + v, 0) || 1;
  const categoryEntries = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
  const dotClasses = ['blue-dot', 'green-dot', 'amber-dot'];
  return <><PageHeading eyebrow="Pilotage de l’activité" title="Rapports & analyses" description="Les indicateurs essentiels pour piloter votre officine." action={<button className="outline-button" onClick={onExport}><ArrowDownToLine size={16} /> Exporter un rapport</button>} /><div className="report-grid"><div className="report-card report-featured"><div className="report-card-top"><div className="report-icon green-soft"><BarChart3 size={20} /></div><span>Ce mois</span></div><h2>Performance commerciale</h2><p>Analysez votre chiffre d’affaires, vos ventes et votre marge.</p><div className="report-number">{monthlyCA.toLocaleString('fr-FR')} <small>FCFA</small></div><div className="report-progress"><span style={{ width: `${progressPercent}%` }} /></div><small>{progressPercent}% de l’objectif mensuel atteint</small></div><div className="report-card"><div className="report-card-top"><div className="report-icon blue-soft"><Package size={20} /></div><span>Stock</span></div><h2>Valeur du stock</h2><p>Répartition de la valeur par catégorie.</p><div className="donut-row"><div className="donut"><span>{stockMillions}M</span></div><div className="legend">{categoryEntries.slice(0, 3).map(([cat, val], i) => <span key={cat}><i className={`dot ${dotClasses[i] ?? 'amber-dot'}`} /> {cat} <b>{Math.round((val / totalStockValue) * 100)}%</b></span>)}</div></div></div><div className="report-card"><div className="report-card-top"><div className="report-icon amber-soft"><FileText size={20} /></div><span>À exporter</span></div><h2>Rapports disponibles</h2><p>Générez les documents de suivi de votre activité.</p><button className="outline-button full-button" onClick={onExport}>Voir les rapports <ArrowUpRight size={15} /></button></div></div></>;
}

function ProductForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (values: ProductFormValues) => void }) {
  const [form, setForm] = useState<ProductFormValues>({ name: '', dci: '', category: 'Antalgique', lot: '', expiry: '', quantity: 0, threshold: 10, price: '' });
  const update = (field: keyof ProductFormValues, value: string | number) => setForm((current) => ({ ...current, [field]: value }));

  return <div className="modal-backdrop" onClick={onClose}><form className="form-panel" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}><div className="form-panel-header"><div><div className="eyebrow">Catalogue officine</div><h2>Ajouter un produit</h2><p>Les informations restent disponibles pendant la session.</p></div><button type="button" className="icon-button" onClick={onClose}><X size={19} /></button></div><div className="form-grid"><label>Nom commercial<input required value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Ex. Doliprane 500 mg" /></label><label>DCI / molécule<input required value={form.dci} onChange={(event) => update('dci', event.target.value)} placeholder="Ex. Paracétamol" /></label><label>Catégorie<select value={form.category} onChange={(event) => update('category', event.target.value)}><option>Antalgique</option><option>Antibiotique</option><option>Digestif</option><option>Parapharmacie</option></select></label><label>Numéro de lot<input required value={form.lot} onChange={(event) => update('lot', event.target.value)} placeholder="Ex. DLP-9021" /></label><label>Date de péremption<input required value={form.expiry} onChange={(event) => update('expiry', event.target.value)} placeholder="MM/AAAA" /></label><label>Stock initial<input required type="number" min="0" value={form.quantity} onChange={(event) => update('quantity', Number(event.target.value))} /></label><label>Seuil d’alerte<input required type="number" min="0" value={form.threshold} onChange={(event) => update('threshold', Number(event.target.value))} /></label><label>Prix de vente<input required value={form.price} onChange={(event) => update('price', event.target.value)} placeholder="Ex. 1 500 FCFA" /></label></div><div className="form-panel-actions"><button type="button" className="outline-button" onClick={onClose}>Annuler</button><button type="submit" className="primary-button"><Plus size={17} /> Ajouter au catalogue</button></div></form></div>;
}

function MovementForm({ products: availableProducts, onClose, onSubmit }: { products: Product[]; onClose: () => void; onSubmit: (values: MovementFormValues) => void }) {
  const [productName, setProductName] = useState(availableProducts[0]?.name ?? '');
  const [type, setType] = useState<MovementFormValues['type']>('Entrée');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('Réception fournisseur');

  return <div className="modal-backdrop" onClick={onClose}><form className="form-panel" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onSubmit({ productName, type, quantity, reason }); }}><div className="form-panel-header"><div><div className="eyebrow">Traçabilité du stock</div><h2>Nouveau mouvement</h2><p>Simulez une entrée, une sortie ou un ajustement.</p></div><button type="button" className="icon-button" onClick={onClose}><X size={19} /></button></div><div className="movement-choice"><button type="button" className={type === 'Entrée' ? 'selected' : ''} onClick={() => setType('Entrée')}><ArrowDownToLine size={17} /><span>Entrée</span><small>Réceptionner du stock</small></button><button type="button" className={type === 'Sortie' ? 'selected danger-choice' : ''} onClick={() => setType('Sortie')}><ArrowUpRight size={17} /><span>Sortie</span><small>Déduire du stock</small></button></div><div className="form-grid"><label className="full-field">Produit<select value={productName} onChange={(event) => setProductName(event.target.value)}>{availableProducts.map((product) => <option key={product.name} value={product.name}>{product.name} · {product.quantity} disponibles</option>)}</select></label><label>Quantité<input required type="number" min="1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label><label>Motif<select value={reason} onChange={(event) => setReason(event.target.value)}><option>Réception fournisseur</option><option>Vente comptoir</option><option>Inventaire physique</option><option>Produit périmé</option><option>Don / casse</option></select></label></div><div className="form-panel-actions"><button type="button" className="outline-button" onClick={onClose}>Annuler</button><button type="submit" className="primary-button"><ClipboardList size={17} /> Enregistrer le mouvement</button></div></form></div>;
}

function QuickSalePanel({ products, onClose, onComplete }: { products: Product[]; onClose: () => void; onComplete: (customer: DemoCustomer) => void }) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [prescription, setPrescription] = useState('Sans ordonnance');
  const [paymentMethod, setPaymentMethod] = useState('Mobile Money');
  const [photoName, setPhotoName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [prescriptionItems, setPrescriptionItems] = useState<PrescriptionLine[]>([{ medication: '', quantity: 1, unitPrice: 0 }]);

  const cartTotal = products.reduce((sum, p) => sum + (cart[p.name] ?? 0) * parsePrice(p.price), 0);
  const prescriptionTotal = prescriptionItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const total = cartTotal + (prescription === 'Sans ordonnance' ? 0 : prescriptionTotal);

  const updateCartQuantity = (productName: string, delta: number) => {
    setCart((current) => {
      const newQty = Math.max(0, (current[productName] ?? 0) + delta);
      const next = { ...current };
      if (newQty === 0) delete next[productName];
      else next[productName] = newQty;
      return next;
    });
  };

  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  const handlePhotoChange = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
      setPhotoError('Choisissez une image de 5 Mo maximum.');
      return;
    }
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(URL.createObjectURL(file));
    setPhotoName(file.name);
    setPhotoError('');
  };

  const updatePrescriptionItem = (index: number, field: keyof PrescriptionLine, value: string | number) => {
    setPrescriptionItems((currentItems) => currentItems.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  };

  const submitSale = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cartLines = products.filter((p) => (cart[p.name] ?? 0) > 0).map((p) => ({ name: p.name, quantity: cart[p.name] }));
    const cartItems = cartLines.map((line) => `${line.name} × ${line.quantity}`);
    const prescriptionDescription = prescription !== 'Sans ordonnance' ? prescriptionItems.filter((item) => item.medication.trim()).map((item) => `${item.medication.trim()} × ${item.quantity}`).join(', ') : '';
    const allItems = [...cartItems, ...(prescriptionDescription ? [prescriptionDescription] : [])].join(', ');
    onComplete({ name: name.trim(), phone: phone.trim(), company: company.trim(), idNumber: idNumber.trim(), prescription, prescriptionItems: allItems, photoName, paymentMethod, amount: `${total.toLocaleString('fr-FR')} FCFA`, cartLines });
  };

  return <div className="modal-backdrop" onClick={onClose}><form className="sale-panel sale-form" onClick={(event) => event.stopPropagation()} onSubmit={submitSale}><div className="sale-panel-header"><div><div className="eyebrow">Point de vente · Kinshasa</div><h2>Nouvelle vente</h2><p className="panel-intro">Enregistrez le client avant de facturer ses articles.</p></div><button type="button" className="icon-button" onClick={onClose}><X size={19} /></button></div><div className="sale-section-title"><UserRound size={17} /><span>Identité du client</span><small>Informations de démonstration</small></div><div className="customer-grid"><label>Nom complet<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex. Jean Mukendi" /></label><label>Téléphone<input required type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+243 81 000 00 00" /></label><label>Entreprise partenaire<input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Ex. Société partenaire" /></label><label>Pièce / référence<input value={idNumber} onChange={(event) => setIdNumber(event.target.value)} placeholder="N° de référence" /></label></div><label className="photo-upload"><span className="photo-preview">{photoUrl ? <img src={photoUrl} alt="Aperçu du client" /> : <Camera size={22} />}</span><span><strong>{photoName || 'Ajouter une photo du client'}</strong><small>Optionnel · image temporaire, non conservée après la session</small></span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => handlePhotoChange(event.target.files?.[0])} /></label>{photoError && <div className="form-error">{photoError}</div>}<div className="sale-fields-row"><label>Ordonnance<select value={prescription} onChange={(event) => setPrescription(event.target.value)}><option>Sans ordonnance</option><option>Ordonnance présentée</option><option>Ordonnance à vérifier</option></select></label><label>Mode de paiement<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option>Mobile Money</option><option>Espèces</option><option>Carte bancaire</option><option>Crédit partenaire</option></select></label></div>{prescription !== 'Sans ordonnance' && <div className="prescription-block"><div className="prescription-heading"><div><strong>Détail de l’ordonnance</strong><span>Renseignez les médicaments réellement pris par le client.</span></div><span className="prescription-badge">{prescription}</span></div><div className="prescription-labels"><span>Médicament</span><span>Qté</span><span>Prix unitaire</span><span>Total</span><span /></div>{prescriptionItems.map((item, index) => <div className="prescription-row" key={`${index}-${item.medication}`}><input required value={item.medication} onChange={(event) => updatePrescriptionItem(index, 'medication', event.target.value)} placeholder="Nom du médicament" /><input required type="number" min="1" value={item.quantity} onChange={(event) => updatePrescriptionItem(index, 'quantity', Number(event.target.value))} /><input required type="number" min="0" value={item.unitPrice} onChange={(event) => updatePrescriptionItem(index, 'unitPrice', Number(event.target.value))} placeholder="FCFA" /><strong>{(item.quantity * item.unitPrice).toLocaleString('fr-FR')} FCFA</strong><button type="button" className="remove-line" onClick={() => setPrescriptionItems((currentItems) => currentItems.length > 1 ? currentItems.filter((_, itemIndex) => itemIndex !== index) : currentItems)} aria-label="Supprimer la ligne">×</button></div>)}<button type="button" className="add-line-button" onClick={() => setPrescriptionItems((currentItems) => [...currentItems, { medication: '', quantity: 1, unitPrice: 0 }])}><Plus size={14} /> Ajouter un médicament</button><div className="prescription-total"><span>Total ordonnance</span><strong>{prescriptionTotal.toLocaleString('fr-FR')} FCFA</strong></div></div>}<div className="sale-section-title cart-title"><ShoppingCart size={17} /><span>Produits demandés</span><small>Disponibilité contrôlée</small></div>{products.map((product) => <div className="sale-line" key={product.name}><div className="sale-product-icon"><Package size={18} /></div><div><strong>{product.name}</strong><span>{product.dci} · Disponible : {product.quantity}</span></div><strong>{product.price}</strong><div className="quantity"><button type="button" onClick={() => updateCartQuantity(product.name, -1)}>-</button><span>{cart[product.name] ?? 0}</span><button type="button" onClick={() => updateCartQuantity(product.name, 1)}>+</button></div></div>)}<div className="sale-total"><span>Total à payer</span><strong>{total.toLocaleString('fr-FR')} FCFA</strong></div><div className="sale-confirmation"><CheckCircle2 size={16} /><span>La facture sera générée et la sortie de stock simulée.</span></div><div className="sale-actions"><button type="button" className="outline-button" onClick={onClose}>Annuler</button><button type="submit" className="primary-button" disabled={total === 0}><CircleDollarSign size={17} /> Facturer et remettre</button></div></form></div>;
}

function ClientsView({ clients, salesData, onAdd, onEdit, onDetail }: { clients: Customer[]; salesData: Sale[]; onAdd: () => void; onEdit: (customer: Customer) => void; onDetail: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(
    () => clients.filter((c) => `${c.name} ${c.phone} ${c.company} ${c.email}`.toLowerCase().includes(search.toLowerCase())),
    [clients, search]
  );
  const totalRevenue = (name: string) => salesData.filter((s) => s.customer === name).reduce((sum, s) => sum + parsePrice(s.amount), 0);
  const lastVisit = (name: string) => { const sale = salesData.find((s) => s.customer === name); return sale ? sale.time : '—'; };
  const enterpriseCount = clients.filter((c) => c.type === 'Entreprise').length;

  return <><PageHeading eyebrow="Fichier clients" title="Clients" description="Gérez les particuliers et entreprises partenaires de votre officine." action={<button className="primary-button" onClick={onAdd}><Plus size={18} /> Ajouter un client</button>} /><div className="stats-strip"><div><Users size={18} /><span><strong>{clients.length}</strong> clients enregistrés</span></div><div><UserRound size={18} /><span><strong>{enterpriseCount}</strong> entreprises partenaires</span></div><div><ShoppingCart size={18} /><span><strong>{salesData.filter((s) => clients.some((c) => c.name === s.customer)).length}</strong> ventes associées</span></div></div><section className="panel table-panel"><div className="table-toolbar"><div className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher par nom, téléphone, entreprise..." /></div></div><div className="table-wrap"><table><thead><tr><th>Client</th><th>Téléphone</th><th>Type</th><th>Entreprise</th><th>CA cumulé</th><th>Dernière visite</th><th /></tr></thead><tbody>{filtered.map((client) => <tr key={client.id}><td><div className="product-cell"><div className="customer-avatar">{client.name.charAt(0).toUpperCase()}</div><div><strong>{client.name}</strong><span>{client.id} · depuis {client.registeredAt}</span></div></div></td><td>{client.phone || '—'}</td><td><span className={`status-pill ${client.type === 'Entreprise' ? 'warning' : 'success'}`}><i />{client.type}</span></td><td>{client.company || '—'}</td><td><strong>{totalRevenue(client.name).toLocaleString('fr-FR')} FCFA</strong></td><td className="table-subtext">{lastVisit(client.name)}</td><td><button className="more-button" onClick={() => onDetail(client.id)}>•••</button></td></tr>)}</tbody></table></div></section></>;
}

function CustomerForm({ customer, onClose, onSubmit }: { customer: Customer | null; onClose: () => void; onSubmit: (values: Omit<Customer, 'id' | 'registeredAt'>) => void }) {
  const [form, setForm] = useState({
    name: customer?.name ?? '',
    phone: customer?.phone ?? '',
    email: customer?.email ?? '',
    company: customer?.company ?? '',
    address: customer?.address ?? '',
    type: customer?.type ?? 'Particulier' as Customer['type'],
    notes: customer?.notes ?? '',
  });
  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));

  return <div className="modal-backdrop" onClick={onClose}><form className="form-panel" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}><div className="form-panel-header"><div><div className="eyebrow">Fichier clients</div><h2>{customer ? 'Modifier le client' : 'Ajouter un client'}</h2><p>Les informations restent disponibles pendant la session.</p></div><button type="button" className="icon-button" onClick={onClose}><X size={19} /></button></div><div className="form-grid"><label>Nom complet<input required value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Ex. Jean Mukendi" /></label><label>Téléphone<input required type="tel" value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="+243 81 000 00 00" /></label><label>Email<input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} placeholder="ex. client@email.cd" /></label><label>Entreprise partenaire<input value={form.company} onChange={(event) => update('company', event.target.value)} placeholder="Ex. Société partenaire" /></label><label>Type de client<select value={form.type} onChange={(event) => update('type', event.target.value)}><option>Particulier</option><option>Entreprise</option></select></label><label>Adresse<input value={form.address} onChange={(event) => update('address', event.target.value)} placeholder="Adresse postale" /></label><label className="full-field">Notes / observations<input value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Allergies, préférences, conditions de crédit..." /></label></div><div className="form-panel-actions"><button type="button" className="outline-button" onClick={onClose}>Annuler</button><button type="submit" className="primary-button"><Plus size={17} /> {customer ? 'Enregistrer' : 'Ajouter le client'}</button></div></form></div>;
}

function CustomerDetail({ customer, salesData, onClose, onEdit, onDelete }: { customer: Customer; salesData: Sale[]; onClose: () => void; onEdit: (customer: Customer) => void; onDelete: (id: string) => void }) {
  const totalCA = salesData.reduce((sum, s) => sum + parsePrice(s.amount), 0);
  return <div className="modal-backdrop" onClick={onClose}><div className="form-panel customer-detail-panel" onClick={(event) => event.stopPropagation()}><div className="form-panel-header customer-detail-header"><button type="button" className="icon-button" onClick={onClose}><ArrowLeft size={19} /></button><div><div className="eyebrow">Fiche client</div><h2>{customer.name}</h2><p>{customer.id} · enregistré le {customer.registeredAt}</p></div></div><div className="customer-detail-hero"><div className="customer-detail-avatar">{customer.name.charAt(0).toUpperCase()}</div><span className={`status-pill ${customer.type === 'Entreprise' ? 'warning' : 'success'}`}><i />{customer.type}</span></div><div className="customer-info-grid"><div className="info-item"><Phone size={15} /><div><span>Téléphone</span><strong>{customer.phone || '—'}</strong></div></div><div className="info-item"><Mail size={15} /><div><span>Email</span><strong>{customer.email || '—'}</strong></div></div><div className="info-item"><MapPin size={15} /><div><span>Adresse</span><strong>{customer.address || '—'}</strong></div></div><div className="info-item"><Store size={15} /><div><span>Entreprise</span><strong>{customer.company || '—'}</strong></div></div></div>{customer.notes && <div className="customer-notes"><strong>Notes</strong><p>{customer.notes}</p></div>}<div className="customer-stats"><div><span>Ventes associées</span><strong>{salesData.length}</strong></div><div><span>CA cumulé</span><strong>{totalCA.toLocaleString('fr-FR')} FCFA</strong></div></div><div className="customer-history"><h3>Historique d’achats</h3>{salesData.length === 0 ? <p className="empty-state">Aucune vente enregistrée pour ce client.</p> : <div className="table-wrap"><table><thead><tr><th>Facture</th><th>Articles</th><th>Montant</th><th>Paiement</th><th>Heure</th></tr></thead><tbody>{salesData.map((sale) => <tr key={sale.invoice}><td><strong className="invoice-number">{sale.invoice}</strong></td><td>{sale.items}</td><td><strong>{sale.amount}</strong></td><td><span className="payment-badge">{sale.method}</span></td><td>{sale.time}</td></tr>)}</tbody></table></div>}</div><div className="form-panel-actions"><button type="button" className="outline-button danger-outline" onClick={() => onDelete(customer.id)}>Supprimer</button><button type="button" className="primary-button" onClick={() => onEdit(customer)}><Pencil size={17} /> Modifier</button></div></div></div>;
}

function SuppliersView({ suppliers, orders, onAdd, onEdit, onDetail, onOrderStatus }: { suppliers: Supplier[]; orders: SupplierOrder[]; onAdd: () => void; onEdit: (supplier: Supplier) => void; onDetail: (id: string) => void; onOrderStatus: (orderId: string, status: SupplierOrder['status']) => void }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(
    () => suppliers.filter((s) => `${s.name} ${s.contact} ${s.phone} ${s.category}`.toLowerCase().includes(search.toLowerCase())),
    [suppliers, search]
  );
  const activeCount = suppliers.filter((s) => s.status === 'Actif').length;
  const pendingOrders = orders.filter((o) => o.status === 'En attente');
  const pendingAmount = pendingOrders.reduce((sum, o) => sum + parsePrice(o.amount), 0);

  return <><PageHeading eyebrow="Chaîne d’approvisionnement" title="Fournisseurs" description="Gérez vos partenaires d’approvisionnement et suivez les commandes." action={<button className="primary-button" onClick={onAdd}><Plus size={18} /> Ajouter un fournisseur</button>} /><div className="stats-strip"><div><Truck size={18} /><span><strong>{suppliers.length}</strong> fournisseurs</span></div><div><CheckCircle2 size={18} /><span><strong>{activeCount}</strong> actifs</span></div><div><ClipboardList size={18} /><span><strong>{pendingOrders.length}</strong> commandes en attente ({pendingAmount.toLocaleString('fr-FR')} FCFA)</span></div></div><section className="panel table-panel"><div className="panel-heading"><div><h2>Fournisseurs enregistrés</h2><p>Cliquez sur un fournisseur pour voir sa fiche et ses commandes</p></div></div><div className="table-toolbar"><div className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher par nom, contact, catégorie..." /></div></div><div className="table-wrap"><table><thead><tr><th>Fournisseur</th><th>Contact</th><th>Téléphone</th><th>Catégorie</th><th>Statut</th><th /></tr></thead><tbody>{filtered.map((supplier) => <tr key={supplier.id}><td><div className="product-cell"><div className="supplier-table-icon"><Truck size={16} /></div><div><strong>{supplier.name}</strong><span>{supplier.id}</span></div></div></td><td>{supplier.contact}</td><td>{supplier.phone}</td><td>{supplier.category}</td><td><span className={`status-pill ${supplier.status === 'Actif' ? 'success' : 'danger'}`}><i />{supplier.status}</span></td><td><button className="more-button" onClick={() => onDetail(supplier.id)}>•••</button></td></tr>)}</tbody></table></div></section>{pendingOrders.length > 0 && <section className="panel table-panel"><div className="panel-heading"><div><h2>Commandes en attente</h2><p>Validez la réception ou annulez une commande</p></div></div><div className="table-wrap"><table><thead><tr><th>Commande</th><th>Fournisseur</th><th>Date</th><th>Articles</th><th>Montant</th><th>Statut</th><th /></tr></thead><tbody>{pendingOrders.map((order) => { const supplier = suppliers.find((s) => s.id === order.supplierId); return <tr key={order.id}><td><strong className="invoice-number">{order.id}</strong></td><td>{supplier?.name ?? '—'}</td><td>{order.date}</td><td>{order.items}</td><td><strong>{order.amount}</strong></td><td><span className="status-pill warning"><i />{order.status}</span></td><td><div className="order-actions"><button className="outline-button" onClick={() => onOrderStatus(order.id, 'Reçue')}><CheckCircle2 size={14} /> Reçue</button><button className="outline-button danger-outline" onClick={() => onOrderStatus(order.id, 'Annulée')}><X size={14} /> Annuler</button></div></td></tr>; })}</tbody></table></div></section>}</>;
}

function SupplierForm({ supplier, onClose, onSubmit }: { supplier: Supplier | null; onClose: () => void; onSubmit: (values: Omit<Supplier, 'id'>) => void }) {
  const [form, setForm] = useState({
    name: supplier?.name ?? '',
    contact: supplier?.contact ?? '',
    phone: supplier?.phone ?? '',
    email: supplier?.email ?? '',
    address: supplier?.address ?? '',
    category: supplier?.category ?? 'Médicaments génériques',
    status: supplier?.status ?? 'Actif' as Supplier['status'],
    notes: supplier?.notes ?? '',
  });
  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));

  return <div className="modal-backdrop" onClick={onClose}><form className="form-panel" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}><div className="form-panel-header"><div><div className="eyebrow">Chaîne d’approvisionnement</div><h2>{supplier ? 'Modifier le fournisseur' : 'Ajouter un fournisseur'}</h2><p>Les informations restent disponibles pendant la session.</p></div><button type="button" className="icon-button" onClick={onClose}><X size={19} /></button></div><div className="form-grid"><label>Nom du fournisseur<input required value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Ex. Laborex RDC" /></label><label>Personne de contact<input required value={form.contact} onChange={(event) => update('contact', event.target.value)} placeholder="Ex. M. K. Kabongo" /></label><label>Téléphone<input required type="tel" value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="+243 81 000 00 00" /></label><label>Email<input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} placeholder="ex. commandes@fournisseur.cd" /></label><label>Adresse<input value={form.address} onChange={(event) => update('address', event.target.value)} placeholder="Adresse postale" /></label><label>Catégorie<select value={form.category} onChange={(event) => update('category', event.target.value)}><option>Médicaments génériques</option><option>Parapharmacie</option><option>Antibiotiques</option><option>Matériel médical</option><option>Antalgique</option></select></label><label>Statut<select value={form.status} onChange={(event) => update('status', event.target.value)}><option>Actif</option><option>Inactif</option></select></label><label className="full-field">Notes / conditions<input value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Délai de livraison, remises, conditions de paiement..." /></label></div><div className="form-panel-actions"><button type="button" className="outline-button" onClick={onClose}>Annuler</button><button type="submit" className="primary-button"><Plus size={17} /> {supplier ? 'Enregistrer' : 'Ajouter le fournisseur'}</button></div></form></div>;
}

function SupplierDetail({ supplier, orders, onClose, onEdit, onDelete, onOrderStatus }: { supplier: Supplier; orders: SupplierOrder[]; onClose: () => void; onEdit: (supplier: Supplier) => void; onDelete: (id: string) => void; onOrderStatus: (orderId: string, status: SupplierOrder['status']) => void }) {
  const totalAmount = orders.reduce((sum, o) => sum + parsePrice(o.amount), 0);
  const receivedCount = orders.filter((o) => o.status === 'Reçue').length;
  const pendingCount = orders.filter((o) => o.status === 'En attente').length;
  return <div className="modal-backdrop" onClick={onClose}><div className="form-panel customer-detail-panel" onClick={(event) => event.stopPropagation()}><div className="form-panel-header customer-detail-header"><button type="button" className="icon-button" onClick={onClose}><ArrowLeft size={19} /></button><div><div className="eyebrow">Fiche fournisseur</div><h2>{supplier.name}</h2><p>{supplier.id} · {supplier.category}</p></div></div><div className="customer-detail-hero"><div className="supplier-detail-avatar"><Truck size={26} /></div><span className={`status-pill ${supplier.status === 'Actif' ? 'success' : 'danger'}`}><i />{supplier.status}</span></div><div className="customer-info-grid"><div className="info-item"><UserRound size={15} /><div><span>Contact</span><strong>{supplier.contact}</strong></div></div><div className="info-item"><Phone size={15} /><div><span>Téléphone</span><strong>{supplier.phone}</strong></div></div><div className="info-item"><Mail size={15} /><div><span>Email</span><strong>{supplier.email || '—'}</strong></div></div><div className="info-item"><MapPin size={15} /><div><span>Adresse</span><strong>{supplier.address || '—'}</strong></div></div></div>{supplier.notes && <div className="customer-notes"><strong>Notes</strong><p>{supplier.notes}</p></div>}<div className="customer-stats four-col"><div><span>Commandes totales</span><strong>{orders.length}</strong></div><div><span>Reçues</span><strong>{receivedCount}</strong></div><div><span>En attente</span><strong>{pendingCount}</strong></div><div><span>Montant cumulé</span><strong>{totalAmount.toLocaleString('fr-FR')} FCFA</strong></div></div><div className="customer-history"><h3>Historique des commandes</h3>{orders.length === 0 ? <p className="empty-state">Aucune commande enregistrée pour ce fournisseur.</p> : <div className="table-wrap"><table><thead><tr><th>Commande</th><th>Date</th><th>Articles</th><th>Montant</th><th>Statut</th><th /></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong className="invoice-number">{order.id}</strong></td><td>{order.date}</td><td>{order.items}</td><td><strong>{order.amount}</strong></td><td><span className={`status-pill ${order.status === 'Reçue' ? 'success' : order.status === 'En attente' ? 'warning' : 'danger'}`}><i />{order.status}</span></td><td>{order.status === 'En attente' ? <div className="order-actions"><button className="outline-button" onClick={() => onOrderStatus(order.id, 'Reçue')}><CheckCircle2 size={14} /> Reçue</button><button className="outline-button danger-outline" onClick={() => onOrderStatus(order.id, 'Annulée')}><X size={14} /></button></div> : <span className="table-subtext">—</span>}</td></tr>)}</tbody></table></div>}</div><div className="form-panel-actions"><button type="button" className="outline-button danger-outline" onClick={() => onDelete(supplier.id)}><Trash2 size={17} /> Supprimer</button><button type="button" className="primary-button" onClick={() => onEdit(supplier)}><Pencil size={17} /> Modifier</button></div></div></div>;
}

export default App;
