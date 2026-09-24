import { Link } from "wouter";
import type { ReactNode } from "react";
import { ChevronLeft, Mail, MessageCircle } from "lucide-react";

// Footer link pages (Sobre Nós, Termos e Condições, Central de Ajuda, etc.)
// used to 404 — the footer already linked to /sobre, /termos, /ajuda, etc.
// (see home.tsx's <footer>), but none of these routes were registered.
// Content here mirrors the facts already stated in the footer (support
// email, MGA/SSL/EUR/18+ badges, chat availability) rather than inventing
// new claims. (Santos, 2026-09-24)

function InfoPageLayout({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] w-full bg-zinc-950 text-white flex flex-col font-sans">
      <header className="sticky top-0 z-40 bg-zinc-950 border-b border-zinc-800/60">
        <div className="flex items-center justify-between px-4 h-16 max-w-3xl mx-auto">
          <Link href="/" className="font-black text-2xl tracking-tighter italic">
            <span className="text-white">BET</span>
            <span className="text-red-600">62</span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            <ChevronLeft size={16} /> Voltar
          </Link>
        </div>
      </header>
      <main className="flex-1 px-4 py-10 max-w-3xl mx-auto w-full">
        <h1 className="text-2xl sm:text-3xl font-black mb-6">{title}</h1>
        <div className="space-y-4 text-sm sm:text-[15px] text-zinc-300 leading-relaxed [&_h2]:text-white [&_h2]:font-bold [&_h2]:text-lg [&_h2]:mt-8 [&_h2]:mb-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_a]:text-red-400 [&_a]:hover:underline">
          {children}
        </div>
      </main>
      <footer className="border-t border-zinc-900 py-6 text-center text-xs text-zinc-600">
        © 2025 BET62 Apostas Esportivas · Todos os direitos reservados · Jogo 18+
      </footer>
    </div>
  );
}

// ─── A BET62 ──────────────────────────────────────────────────────────────

export function SobrePage() {
  return (
    <InfoPageLayout title="Sobre Nós">
      <p>
        A BET62 é uma plataforma de apostas desportivas e casino online
        pensada para quem quer uma experiência rápida, segura e sem
        complicações. Reunimos as apostas de desporto num Sportsbook
        integrado e um catálogo de casino num único lugar, com depósitos e
        levantamentos em euros (€) e suporte disponível todos os dias.
      </p>
      <h2>O que oferecemos</h2>
      <ul>
        <li>Apostas desportivas em pré-jogo e ao vivo, com cotas competitivas.</li>
        <li>Casino online com slots e jogos de mesa.</li>
        <li>Carteira única com depósito e levantamento simples em EUR.</li>
        <li>Suporte ao cliente por chat e email, 24 horas por dia.</li>
      </ul>
      <h2>Jogo responsável</h2>
      <p>
        Operamos sob boas práticas de jogo responsável: limites de depósito,
        autoexclusão e ferramentas de controlo estão sempre disponíveis em{" "}
        <Link href="/perfil">Perfil</Link>. Veja também a nossa página de{" "}
        <Link href="/jogo-responsavel">Responsabilidade Social</Link>.
      </p>
    </InfoPageLayout>
  );
}

export function ImprensaPage() {
  return (
    <InfoPageLayout title="Imprensa">
      <p>
        Esta página reúne informação para jornalistas e órgãos de
        comunicação social sobre a BET62.
      </p>
      <h2>Contacto de imprensa</h2>
      <p>
        Para pedidos de entrevista, materiais de marca ou esclarecimentos,
        contacte-nos através de{" "}
        <a href="mailto:suportebet62@gmail.com">suportebet62@gmail.com</a>{" "}
        indicando "Imprensa" no assunto. Respondemos o mais rapidamente
        possível.
      </p>
      <h2>Sobre a marca</h2>
      <p>
        Para uma descrição geral da plataforma, consulte a página{" "}
        <Link href="/sobre">Sobre Nós</Link>.
      </p>
    </InfoPageLayout>
  );
}

export function CarreirasPage() {
  return (
    <InfoPageLayout title="Carreiras">
      <p>
        Não há neste momento vagas abertas publicadas. Mesmo assim, se quer
        fazer parte da equipa BET62, pode enviar-nos o seu currículo — guardamos
        os contactos recebidos para futuras oportunidades.
      </p>
      <h2>Candidatura espontânea</h2>
      <p>
        Envie o seu CV e uma breve apresentação para{" "}
        <a href="mailto:suportebet62@gmail.com">suportebet62@gmail.com</a> com
        o assunto "Candidatura". Indique a área de interesse (produto,
        engenharia, apoio ao cliente, operações, etc.).
      </p>
    </InfoPageLayout>
  );
}

export function AfiliadosPage() {
  return (
    <InfoPageLayout title="Afiliados">
      <p>
        O programa de afiliados BET62 é para criadores de conteúdo, sites e
        parceiros que queiram promover a plataforma junto do seu público e
        ser remunerados pelos jogadores que trazem.
      </p>
      <h2>Como funciona</h2>
      <ul>
        <li>Recebe um link/código de afiliado único para partilhar.</li>
        <li>É acompanhado o registo e a atividade dos jogadores referidos.</li>
        <li>A comissão e os termos concretos são definidos caso a caso, após contacto.</li>
      </ul>
      <h2>Candidatar-se</h2>
      <p>
        Envie um email para{" "}
        <a href="mailto:suportebet62@gmail.com">suportebet62@gmail.com</a> com
        o assunto "Afiliados", indicando o seu site/canal e a audiência
        aproximada. A nossa equipa entra em contacto para alinhar os detalhes.
      </p>
    </InfoPageLayout>
  );
}

// ─── Legal ────────────────────────────────────────────────────────────────

export function TermosPage() {
  return (
    <InfoPageLayout title="Termos e Condições">
      <p>
        Estes termos regem a utilização da plataforma BET62 ("nós", "a
        plataforma"). Ao criar uma conta e utilizar os nossos serviços, aceita
        estas condições.
      </p>
      <h2>1. Elegibilidade</h2>
      <p>
        Só pode registar-se e apostar quem tiver 18 anos ou mais e residir em
        jurisdições onde a atividade seja legalmente permitida. Reservamo-nos
        o direito de pedir prova de idade e identidade (verificação KYC) antes
        de permitir levantamentos.
      </p>
      <h2>2. Conta e segurança</h2>
      <p>
        É responsável por manter a confidencialidade da sua senha e por toda
        a atividade realizada a partir da sua conta. Cada pessoa pode ter
        apenas uma conta ativa. Contas duplicadas ou com dados falsos podem
        ser suspensas.
      </p>
      <h2>3. Depósitos, apostas e levantamentos</h2>
      <p>
        Os saldos são geridos em euros (€). As apostas desportivas são
        processadas através do nosso Sportsbook integrado; regras específicas
        de mercados, cotas e resultados encontram-se em{" "}
        <Link href="/regras">Regras de Apostas</Link>. Levantamentos estão
        sujeitos a verificação de identidade e às políticas de prevenção de
        fraude e branqueamento de capitais.
      </p>
      <h2>4. Jogo responsável</h2>
      <p>
        Disponibilizamos limites de depósito, pausas e autoexclusão em{" "}
        <Link href="/perfil">Perfil → Limites e Autoexclusão</Link>. Consulte
        também a página de <Link href="/jogo-responsavel">Responsabilidade Social</Link>.
      </p>
      <h2>5. Encerramento de conta</h2>
      <p>
        Podemos suspender ou encerrar uma conta em caso de violação destes
        termos, suspeita de fraude, uso indevido de bónus ou por pedido do
        próprio utilizador.
      </p>
      <h2>6. Alterações</h2>
      <p>
        Estes termos podem ser atualizados periodicamente. Alterações
        relevantes serão comunicadas através da plataforma.
      </p>
      <h2>7. Contacto</h2>
      <p>
        Dúvidas sobre estes termos podem ser dirigidas para{" "}
        <a href="mailto:suportebet62@gmail.com">suportebet62@gmail.com</a>.
      </p>
    </InfoPageLayout>
  );
}

export function PrivacidadePage() {
  return (
    <InfoPageLayout title="Política de Privacidade">
      <p>
        Esta política explica que dados pessoais recolhemos, para que fins os
        usamos e como os protegemos.
      </p>
      <h2>1. Dados que recolhemos</h2>
      <ul>
        <li>Dados de registo: nome, email, palavra-passe (encriptada) e, opcionalmente, NIF.</li>
        <li>Dados de conta: saldo, histórico de apostas e transações.</li>
        <li>Dados de verificação (KYC), quando exigidos por lei antes de um levantamento.</li>
        <li>Dados técnicos: dispositivo, tipo de sessão e registos de acesso, para segurança.</li>
      </ul>
      <h2>2. Para que usamos os seus dados</h2>
      <p>
        Para criar e gerir a sua conta, processar apostas e pagamentos,
        cumprir obrigações legais (incluindo prevenção de fraude e jogo
        responsável) e comunicar consigo sobre a sua conta.
      </p>
      <h2>3. Segurança</h2>
      <p>
        As comunicações com a plataforma são cifradas com SSL de 256 bits e
        as palavras-passe são guardadas de forma encriptada, nunca em texto
        simples.
      </p>
      <h2>4. Os seus direitos</h2>
      <p>
        Pode pedir acesso, correção ou eliminação dos seus dados pessoais,
        dentro dos limites impostos pelas obrigações legais de registo
        financeiro e de jogo. Para exercer estes direitos, contacte{" "}
        <a href="mailto:suportebet62@gmail.com">suportebet62@gmail.com</a>.
      </p>
      <h2>5. Cookies</h2>
      <p>
        Usamos cookies essenciais e, com o seu consentimento, cookies
        analíticos e de marketing. Pode gerir as suas preferências em{" "}
        <Link href="/perfil">Perfil → Configurações de Privacidade</Link>. Mais
        detalhes na página de <Link href="/cookies">Cookies</Link>.
      </p>
    </InfoPageLayout>
  );
}

export function CookiesPage() {
  return (
    <InfoPageLayout title="Cookies">
      <p>
        Usamos cookies e tecnologias semelhantes para o site funcionar
        corretamente e para melhorar a sua experiência.
      </p>
      <h2>Tipos de cookies que usamos</h2>
      <ul>
        <li>
          <strong className="text-white">Essenciais</strong> — necessários
          para iniciar sessão, manter o seu carrinho/boletim e o
          funcionamento básico do site. Não podem ser desativados.
        </li>
        <li>
          <strong className="text-white">Analíticos</strong> — ajudam-nos a
          entender como a plataforma é usada, para a melhorar.
        </li>
        <li>
          <strong className="text-white">Marketing</strong> — usados para
          mostrar promoções mais relevantes para si.
        </li>
      </ul>
      <h2>Gerir as suas preferências</h2>
      <p>
        Pode ativar ou desativar cookies analíticos e de marketing em{" "}
        <Link href="/perfil">Perfil → Configurações de Privacidade</Link>{" "}
        a qualquer momento. Cookies essenciais mantêm-se sempre ativos, pois o
        site não funciona sem eles.
      </p>
    </InfoPageLayout>
  );
}

export function JogoResponsavelPage() {
  return (
    <InfoPageLayout title="Responsabilidade Social">
      <p>
        O jogo deve ser uma forma de entretenimento, nunca uma fonte de
        rendimento ou uma forma de resolver problemas financeiros. A BET62
        está disponível apenas para maiores de 18 anos.
      </p>
      <h2>Ferramentas de controlo</h2>
      <ul>
        <li>Limites de depósito, configuráveis em Perfil → Limites e Autoexclusão.</li>
        <li>Pausa temporária ou autoexclusão da plataforma.</li>
        <li>Histórico completo de apostas e transações, sempre visível na sua conta.</li>
      </ul>
      <p>
        Aceda a estas opções em{" "}
        <Link href="/perfil">Perfil → Limites e Autoexclusão</Link>.
      </p>
      <h2>Sinais de alerta</h2>
      <p>
        Apostar mais do que planeava, tentar recuperar perdas com apostas
        maiores, ou sentir que o jogo está a afetar a sua vida pessoal ou
        financeira são sinais de que deve procurar ajuda ou fazer uma pausa.
      </p>
      <h2>Onde procurar ajuda</h2>
      <ul>
        <li>
          <a href="https://www.gamblersanonymous.org/" target="_blank" rel="noopener noreferrer">
            Jogadores Anónimos
          </a>
        </li>
        <li>
          <a href="https://www.gamcare.org.uk/" target="_blank" rel="noopener noreferrer">
            GamCare — apoio e autoexclusão
          </a>
        </li>
      </ul>
    </InfoPageLayout>
  );
}

// ─── Apoio ao Cliente ─────────────────────────────────────────────────────

export function AjudaPage() {
  return (
    <InfoPageLayout title="Central de Ajuda">
      <p>Respostas rápidas às perguntas mais comuns.</p>
      <h2>Como depositar?</h2>
      <p>
        Vá a <Link href="/carteira">Carteira</Link> e toque no botão de
        depósito (ícone +). Os fundos ficam disponíveis de imediato após a
        confirmação do pagamento.
      </p>
      <h2>Como levantar?</h2>
      <p>
        Em <Link href="/carteira">Carteira</Link>, escolha a opção de
        levantamento. Pode ser necessário confirmar a sua identidade antes do
        primeiro levantamento, conforme descrito nos{" "}
        <Link href="/termos">Termos e Condições</Link>.
      </p>
      <h2>Como aposto?</h2>
      <p>
        As apostas desportivas são feitas dentro do separador{" "}
        <Link href="/sportsbook">Esporte</Link>, no nosso Sportsbook
        integrado. Escolha o evento e o mercado desejado para adicionar ao
        boletim.
      </p>
      <h2>Não recebo emails/notificações</h2>
      <p>
        Verifique a pasta de spam e confirme que o email da sua conta está
        correto em <Link href="/perfil">Perfil</Link>. Se persistir, contacte
        o suporte.
      </p>
      <h2>Ainda com dúvidas?</h2>
      <p>
        Visite a página de <Link href="/contacto">Contacto</Link> ou
        escreva para{" "}
        <a href="mailto:suportebet62@gmail.com">suportebet62@gmail.com</a>.
      </p>
    </InfoPageLayout>
  );
}

export function ContactoPage() {
  return (
    <InfoPageLayout title="Contacto">
      <p>Estamos disponíveis todos os dias para o ajudar.</p>
      <div className="flex flex-col gap-3 mt-2">
        <a
          href="mailto:suportebet62@gmail.com"
          className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 hover:border-zinc-600 transition-colors"
        >
          <Mail size={18} className="text-red-400" />
          <div>
            <div className="text-white font-semibold text-sm">Email</div>
            <div className="text-zinc-400 text-sm">suportebet62@gmail.com</div>
          </div>
        </a>
        <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
          <MessageCircle size={18} className="text-red-400" />
          <div>
            <div className="text-white font-semibold text-sm">Chat</div>
            <div className="text-zinc-400 text-sm">Disponível 24 horas por dia, 7 dias por semana</div>
          </div>
        </div>
      </div>
      <p className="mt-6">
        Antes de escrever, veja se a sua dúvida já tem resposta na{" "}
        <Link href="/ajuda">Central de Ajuda</Link>.
      </p>
    </InfoPageLayout>
  );
}

export function PagamentosPage() {
  return (
    <InfoPageLayout title="Métodos de Pagamento">
      <p>
        Todos os saldos, depósitos e levantamentos na BET62 são feitos em
        euros (€).
      </p>
      <h2>Depósitos</h2>
      <p>
        Aceitamos cartão de crédito/débito (Visa, Mastercard) através de um
        processador de pagamentos seguro. Os depósitos são creditados de
        imediato após a confirmação do pagamento.
      </p>
      <h2>Levantamentos</h2>
      <p>
        Os levantamentos são processados para o mesmo método usado no
        depósito, sempre que possível, e podem exigir verificação de
        identidade antes da primeira transação — ver{" "}
        <Link href="/termos">Termos e Condições</Link>.
      </p>
      <h2>Segurança</h2>
      <p>
        Todas as transações passam por ligações cifradas com SSL de 256 bits.
        Não guardamos os dados completos do seu cartão nos nossos servidores.
      </p>
      <p>
        Para gerir depósitos e levantamentos, aceda a{" "}
        <Link href="/carteira">Carteira</Link>.
      </p>
    </InfoPageLayout>
  );
}

export function RegrasPage() {
  return (
    <InfoPageLayout title="Regras de Apostas">
      <p>
        As apostas desportivas na BET62 são processadas através do nosso
        Sportsbook integrado. As regras abaixo aplicam-se de forma geral;
        cada mercado pode ter regras específicas apresentadas junto à própria
        aposta.
      </p>
      <h2>Cotas e resultados</h2>
      <p>
        As cotas apresentadas no momento da aposta são as cotas usadas para
        calcular o pagamento, exceto em mercados explicitamente marcados como
        "cota flutuante" (Ao Vivo). Os resultados seguem os dados oficiais da
        competição.
      </p>
      <h2>Apostas ao vivo</h2>
      <p>
        Em eventos ao vivo, pode haver um pequeno atraso entre a jogada real
        e a atualização das cotas/mercados. Uma aposta só é aceite depois de
        confirmada — ver o estado no seu boletim.
      </p>
      <h2>Apostas anuladas</h2>
      <p>
        Uma aposta pode ser anulada (e o valor devolvido) se o evento for
        cancelado, suspenso sem retoma ou se o mercado for invalidado por
        erro claro de cotação. Nestes casos o valor da aposta é devolvido ao
        saldo.
      </p>
      <h2>Limites e uso indevido</h2>
      <p>
        Reservamo-nos o direito de limitar apostas ou encerrar contas em
        casos de utilização fraudulenta, conluio entre contas ou exploração
        de erros evidentes de cotação.
      </p>
      <h2>Dúvidas sobre uma aposta</h2>
      <p>
        Se tiver dúvidas sobre o resultado de uma aposta específica, contacte
        o suporte em <Link href="/contacto">Contacto</Link> indicando o
        identificador da aposta, visível em{" "}
        <Link href="/minhas-apostas">Minhas Apostas</Link>.
      </p>
    </InfoPageLayout>
  );
}
