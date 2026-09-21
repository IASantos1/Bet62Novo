                      const hasEscanteios =
                        Object.values(mk?.corners ?? {}).some((v: any) => (Number(v) ?? 0) > 1.01) ||
                        (mk?.homeCorners?.over ?? 0) > 1.01 ||
                        (mk?.awayCorners?.over ?? 0) > 1.01 ||
                        (mk?.cornersHandicap?.home ?? 0) > 1.01 ||
                        hasExtraBucket("escanteios");
                      if (hasEscanteios) baseTabs.push({ key: "escanteios", label: "Escanteios" });
                      const hasCartoes =
                        Object.values(mk?.cards ?? {}).some((v: any) => (Number(v) ?? 0) > 1.01) ||
                        (mk?.homeCards?.over ?? 0) > 1.01 ||
                        (mk?.awayCards?.over ?? 0) > 1.01 ||
                        hasExtraBucket("cartoes");
                      if (hasCartoes) baseTabs.push({ key: "cartoes", label: "Cartões" });
                      const hasAsiatico =
                        (Number(mk?.drawNoBet?.home ?? 0) > 1.01) ||
                        (Number(mk?.asianHandicap?.home ?? 0) > 1.01) ||
                        (Number(mk?.europeanHandicap?.home ?? 0) > 1.01) ||
                        Object.values((mk?.asianTotals ?? {}) as any).some((v: any) => (Number(v) ?? 0) > 1.01) ||
                        hasExtraBucket("asiatico");
                      if (hasAsiatico) baseTabs.push({ key: "asiatico", label: "Asiático" });
                      const hasBetBuilder = hasResult || hasDupla || hasGols || hasHandicap || has1Tempo || hasEspeciais;
                      if (hasBetBuilder) {
                        const idx = baseTabs.findIndex((t) => t.key === "resultado");
                        baseTabs.splice(idx >= 0 ? idx : 1, 0, { key: "betbuilder", label: "Bet Builder", icon: "🧩" });
                      }
                      if (isLateGame) {
                        return baseTabs.filter((t) =>
                          ["todos", "resultado", "gols", "handicap"].includes(t.key),
                        );
                      }
                      return baseTabs;
                    })();

    const m = match.markets;
    const tennisExtra = isTennis
      ? ((m as any)?.tennisExtra as Record<string, any> | undefined)
      : undefined;
    const hasTennisHandicapMarkets = !!(
      tennisExtra?.setHandicap?.home > 0 ||
      tennisExtra?.setHandicap?.away > 0 ||
      tennisExtra?.gameHandicap?.home > 0 ||
      tennisExtra?.gameHandicap?.away > 0
    );

    // Show markets when hasRealOdds=true, OR when tennis has valid computed tennisExtra markets,
    // OR when the match has computed markets (V1-built football with doubleChance/totalGoals)
    const hasTennisMarkets =
      match.sport === "tennis" && !!m?.tennisExtra?.firstSet?.home;
    const hasComputedMarkets = hasPlayableMarketOdds(m);
    const isFootballLike =
      (match.sport ?? "football") === "football" ||
      (match.sport ?? "football") === "baseball" ||
      (match.sport ?? "football") === "basketball" ||
      (match.sport ?? "football") === "volleyball" ||
      (match.sport ?? "football") === "hockey" ||
      (match.sport ?? "football") === "mma";
    if (!isFootballLike && !matchHasPlayableOdds(match) && !hasTennisMarkets && !hasComputedMarkets) {
      return (
        <div className="mt-4 text-center py-10 text-zinc-500">
          <div className="text-3xl mb-3">📊</div>
          <div className="text-sm font-medium">
            Odds não disponíveis para esta partida.
          </div>
          <div className="text-xs mt-1 text-zinc-600">
            Apenas partidas com odds confirmadas são apresentadas.
          </div>
        </div>
      );
    }

    if (!m) {
      return (
        <div className="mt-4 text-center py-10 text-zinc-500">
          <div className="text-3xl mb-3">⏳</div>
          <div className="text-sm font-medium">A carregar mercados…</div>
        </div>
      );
    }

    // Penalty shootout: replace entire market area with VENCEDOR DA FINAL only
    if (showPen && m?.penExtra) {
      return (
        <div className="mt-4">
          <div className="flex flex-col items-center gap-4 py-4">
            <span className="text-[11px] font-black uppercase tracking-widest text-white/80">
              🎯 Vencedor da Final
            </span>
            <div className="flex gap-3 w-full max-w-xs">
              <MarketOddsBtn
                match={match}
                sel="pen-home"
                odd={m.penExtra.winner.home}
                market="penaltis"
                label={match.home}
              />
              <MarketOddsBtn
                match={match}
                sel="pen-away"
                odd={m.penExtra.winner.away}
                market="penaltis"
                label={match.away}
              />
            </div>
          </div>
        </div>
      );
    }

    const getExtraAllOddsSectionsForBucket = (
      bucket: "gols" | "escanteios" | "cartoes" | "handicap" | "asiatico" | "especiais",
    ) =>
      extraAllOddsSections
        .map((section) => ({
          ...section,
          markets: section.markets.filter(
            ({ market }) => classifyExtraAllOddsBucket(market) === bucket,
          ),
        }))
        .filter((section) => section.markets.length > 0);
    const extraGoalsSections = getExtraAllOddsSectionsForBucket("gols");
    const extraCornersSections = getExtraAllOddsSectionsForBucket("escanteios");
    const extraCardsSections = getExtraAllOddsSectionsForBucket("cartoes");
    const extraHandicapSections = getExtraAllOddsSectionsForBucket("handicap");
    const extraAsianSections = getExtraAllOddsSectionsForBucket("asiatico");
    const extraSpecialSections = getExtraAllOddsSectionsForBucket("especiais");
    const formatExtraAllOddsChoiceLabel = (
      market: AllOddsMarket,
      choice: { name: string; label: string; odds: number },
      bucket: "gols" | "escanteios" | "cartoes" | "handicap" | "asiatico" | "especiais",
    ) => {
      const marketText = normalizeAllOddsText(`${market.group} ${market.name}`);
      const choiceName = normalizeAllOddsText(choice.name ?? "");
      const choiceLabel = String(choice.label ?? "").trim();
      const lineMatch = choiceLabel.match(/(\d+(?:[.,]\d+)?)/);
      const line = lineMatch?.[1]?.replace(",", ".");
      if (bucket === "gols" && /(odd\/even|odd even|impar|par)/.test(marketText)) {
        if (choiceName === "1" || choiceName.includes("odd") || /^home$/i.test(choiceLabel) || /^mandante$/i.test(choiceLabel) || /^odd$/i.test(choiceLabel)) {
          return "Ímpar";
        }
        if (choiceName === "0" || choiceName.includes("even") || /^par$/i.test(choiceLabel) || /^even$/i.test(choiceLabel)) {
          return "Par";
        }
      }
      if (/^over\b/i.test(choiceLabel)) {
        if (/away team goals/.test(marketText) && line) return `Fora +${line}`;
        if (/home team goals/.test(marketText) && line) return `Casa +${line}`;
        return line ? `Mais ${line}` : choiceLabel.replace(/^over\b/i, "Mais");
      }
      if (/^under\b/i.test(choiceLabel)) {
        if (/away team goals/.test(marketText) && line) return `Fora -${line}`;
        if (/home team goals/.test(marketText) && line) return `Casa -${line}`;
        return line ? `Menos ${line}` : choiceLabel.replace(/^under\b/i, "Menos");
      }
      return choiceLabel
        .replace(/^yes\b/i, "Sim")
        .replace(/^no\b/i, "Não")
        .replace(/^draw\b/i, "Empate");
    };
    const formatExtraAllOddsMarketTitle = (
      market: AllOddsMarket,
      bucket: "gols" | "escanteios" | "cartoes" | "handicap" | "asiatico" | "especiais",
    ) => {
      const marketText = normalizeAllOddsText(`${market.group} ${market.name}`);
      if (bucket === "gols") {
        if (/away team goals/.test(marketText)) {
          return "Gols da Equipa Visitante — Acima / Abaixo";
        }
        if (/home team goals/.test(marketText)) {
          return "Gols da Equipa da Casa — Acima / Abaixo";
        }
        if (/(odd\/even|odd even|impar|par)/.test(marketText)) {
          return "Total de Gols — Ímpar / Par";
        }
        if (/both teams to score/.test(marketText)) {
          return "Ambas as Equipas Marcam";
        }
        if (/goals over\/under|goals over under/.test(marketText)) {
          return "Gols Acima / Abaixo";
        }
      }
      if (bucket === "escanteios") {
        if (/handicap/.test(marketText)) return "Handicap de Cantos";
        if (/home/.test(marketText)) return "Cantos da Casa — Acima / Abaixo";
        if (/away/.test(marketText)) return "Cantos do Visitante — Acima / Abaixo";
        return "Cantos — Acima / Abaixo";
      }
      if (bucket === "cartoes") {
        if (/home/.test(marketText)) return "Cartões da Casa — Acima / Abaixo";
        if (/away/.test(marketText)) return "Cartões do Visitante — Acima / Abaixo";
        return "Cartões — Acima / Abaixo";
      }
      if (bucket === "handicap") {
        return "Handicap";
      }
      if (bucket === "asiatico") {
        if (/draw no bet|empate anulado/.test(marketText)) {
          return "Empate Anulado";
        }
        if (/handicap/.test(marketText)) {
          return "Handicap Asiático";
        }
        if (/total/.test(marketText)) {
          return "Total Asiático";
        }
        return "Asiático";
      }
      if (bucket === "especiais") {
        return market.name || market.group || "Especiais";
      }
      return market.name || market.group || "Mercado";
    };
    const renderInlineExtraAllOdds = (
      sections: typeof extraAllOddsSections,
      bucket: "gols" | "escanteios" | "cartoes" | "handicap" | "asiatico" | "especiais",
    ) => {
      if (!isFootball || allOddsLoading || sections.length === 0) return null;
      // "Todos" must actually include every open MrDoge market. Previously
      // every non-native market was deliberately hidden here for live games,
      // which made a 14-market API response look like only the basic markets.
      return (
        <div className="space-y-2">
          {sections.map((section) => {
            const groupedMarkets: Array<{
              title: string;
              items: Array<{
                market: AllOddsMarket;
                originalIndex: number;
              }>;
            }> = section.markets.reduce((acc, entry) => {
              const title = formatExtraAllOddsMarketTitle(entry.market, bucket);
              const last = acc[acc.length - 1];
              if (last && last.title === title) {
                last.items.push(entry);
                return acc;
              }
              acc.push({ title, items: [entry] });
              return acc;
            }, []);
            return (
              <div key={`inline-${bucket}-${section.section}`} className="space-y-2">
                {groupedMarkets.map((group, groupIndex) => (
                  <MarketGroup
                    key={`inline-${bucket}-${section.section}-${groupIndex}`}
                    title={group.title}
                  >
                    {group.items.map(({ market, originalIndex }) => (
                      <div
                        key={`all-row-${bucket}-${originalIndex}`}
                        className="w-full flex gap-2"
                      >
                        {market.choices.map((choice, choiceIndex) => (
                          <MarketOddsBtn
                            key={`all-${bucket}-${originalIndex}-${choiceIndex}`}
                            match={match}
                            sel={`all-${bucket}-${originalIndex}-${choiceIndex}`}
                            odd={choice.odds}
                            market={`all-${bucket}-${originalIndex}`}
                            label={formatExtraAllOddsChoiceLabel(market, choice, bucket)}
                          />
                        ))}
                      </div>
                    ))}
                  </MarketGroup>
                ))}
              </div>
            );
          })}
        </div>
      );
    };

    marketGroupSeqRef.current = 0;
    return (
      <MarketTabCtx.Provider value={modalTab}>
        <MarketGroupOpenCtx.Provider
          value={{
            matchId: String(match.id),
            getOpen: marketGroupOpenApi.getOpen,
            setOpen: marketGroupOpenApi.setOpen,
          }}
        >
          <MarketGroupSeqCtx.Provider
            key={`mgrp:${match.id}:${modalTab}`}
            value={marketGroupSeqApi}
          >
            <div className="mt-0">

              {/* ── MARKET TABS BAR ── */}
              {tabs.length > 1 && (
                <div
                  ref={tabContainerRef}
                  className="flex gap-1.5 overflow-x-auto pb-2 mb-3 -mx-1 px-1"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                  {tabs.map((tab) => (
                    <button
                      key={tab.key}
                      data-tab={tab.key}
                      onClick={() => {
                        setModalTab(tab.key);
                        setTimeout(() => scrollTabIntoView(tab.key), 0);
                      }}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-bold transition-all whitespace-nowrap ${
                        modalTab === tab.key
                          ? "bg-red-600 text-white shadow-sm"
                          : "bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700"
                      }`}
                    >
                      {(tab as any).icon && (
                        <span className="mr-1">{(tab as any).icon}</span>
                      )}
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
              {isFootball && allOddsError && (
                <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-medium text-amber-200">
                  O catálogo completo de mercados está temporariamente indisponível. As odds visíveis abaixo podem estar incompletas.
                </div>
              )}

              {/* ── BET BUILDER (own tab, between Todos and Resultado) ── */}
              {modalTab === "betbuilder" && (() => {
                const _mk = match.markets;
                const _ho = match.odds?.home ?? 0;
                const _ao = match.odds?.away ?? 0;
                const _do = match.odds?.draw ?? 0;
                const _hn = teamNamePt(match.home);
                const _an = teamNamePt(match.away);

                // Build the conflict groups
                const RES = ["home", "draw", "away"];
                const DC  = ["homeOrDraw", "awayOrDraw", "homeOrAway"];
                const O15 = ["o15", "u15"];
                const O25 = ["o25", "u25"];
                const O35 = ["o35", "u35"];
                const BTS = ["bts-yes", "bts-no"];
                const HT  = ["ht-home", "ht-draw", "ht-away"];

                const conflictFor = (id: string): string[] => {
                  // Resultado e Dupla Chance tratados como um único grupo: Dupla
                  // Chance é uma combinação dos mesmos 3 resultados (home/draw/away),
                  // então misturar "home" com "awayOrDraw" é contraditório e misturar
                  // "home" com "homeOrDraw" é redundante — a Dupla Chance já cobre isso.
                  const groups = [[...RES, ...DC], O15, O25, O35, BTS, HT];
                  const out: string[] = [];
                  for (const g of groups) {
                    if (g.includes(id)) {
                      for (const other of g) if (other !== id) out.push(other);
                    }
                  }
                  return out;
                };

                const safe = (o: number) => o && o > 1.01 ? o : 0;

                const builderMarkets: BuilderMarket[] = [
                  // Resultado
                  ...(safe(_ho) ? [{ id: "home",  label: `${_hn} — Vitória`,   market: "result", selection: "home",  odds: _ho, category: "Resultado",      conflictIds: conflictFor("home") }] : []),
                  ...(safe(_do) ? [{ id: "draw",  label: "Empate",              market: "result", selection: "draw",  odds: _do, category: "Resultado",      conflictIds: conflictFor("draw") }] : []),
                  ...(safe(_ao) ? [{ id: "away",  label: `${_an} — Vitória`,   market: "result", selection: "away",  odds: _ao, category: "Resultado",      conflictIds: conflictFor("away") }] : []),
                  // Dupla Chance
                  ...(_mk?.doubleChance?.homeOrDraw && safe(_mk.doubleChance.homeOrDraw) ? [{ id: "homeOrDraw", label: `${_hn} ou Empate`,     market: "dupla", selection: "homeOrDraw", odds: _mk.doubleChance.homeOrDraw, category: "Dupla Chance", conflictIds: conflictFor("homeOrDraw") }] : []),
                  ...(_mk?.doubleChance?.awayOrDraw && safe(_mk.doubleChance.awayOrDraw) ? [{ id: "awayOrDraw", label: `${_an} ou Empate`,     market: "dupla", selection: "awayOrDraw", odds: _mk.doubleChance.awayOrDraw, category: "Dupla Chance", conflictIds: conflictFor("awayOrDraw") }] : []),
                  ...(_mk?.doubleChance?.homeOrAway && safe(_mk.doubleChance.homeOrAway) ? [{ id: "homeOrAway", label: `${_hn} ou ${_an}`,     market: "dupla", selection: "homeOrAway", odds: _mk.doubleChance.homeOrAway, category: "Dupla Chance", conflictIds: conflictFor("homeOrAway") }] : []),
                  // Total de Golos
                  ...(_mk?.totalGoals?.over15 && safe(_mk.totalGoals.over15) ? [{ id: "o15", label: "Mais de 1.5 Golos",  market: "gols", selection: "o15", odds: _mk.totalGoals.over15,  category: "Total de Golos", conflictIds: conflictFor("o15") }] : []),
                  ...(_mk?.totalGoals?.over25 && safe(_mk.totalGoals.over25) ? [{ id: "o25", label: "Mais de 2.5 Golos",  market: "gols", selection: "o25", odds: _mk.totalGoals.over25,  category: "Total de Golos", conflictIds: conflictFor("o25") }] : []),
                  ...(_mk?.totalGoals?.over35 && safe(_mk.totalGoals.over35) ? [{ id: "o35", label: "Mais de 3.5 Golos",  market: "gols", selection: "o35", odds: _mk.totalGoals.over35,  category: "Total de Golos", conflictIds: conflictFor("o35") }] : []),
                  ...(_mk?.totalGoals?.under25 && safe(_mk.totalGoals.under25) ? [{ id: "u25", label: "Menos de 2.5 Golos", market: "gols", selection: "u25", odds: _mk.totalGoals.under25, category: "Total de Golos", conflictIds: conflictFor("u25") }] : []),
                  ...(_mk?.totalGoals?.under35 && safe(_mk.totalGoals.under35) ? [{ id: "u35", label: "Menos de 3.5 Golos", market: "gols", selection: "u35", odds: _mk.totalGoals.under35, category: "Total de Golos", conflictIds: conflictFor("u35") }] : []),
                  // Ambas Marcam
                  ...(_mk?.bothTeamsScore?.yes && safe(_mk.bothTeamsScore.yes) ? [{ id: "bts-yes", label: "Ambas Marcam — Sim", market: "dupla", selection: "bts-yes", odds: _mk.bothTeamsScore.yes, category: "Ambas Marcam", conflictIds: conflictFor("bts-yes") }] : []),
                  ...(_mk?.bothTeamsScore?.no  && safe(_mk.bothTeamsScore.no)  ? [{ id: "bts-no",  label: "Ambas Marcam — Não", market: "dupla", selection: "bts-no",  odds: _mk.bothTeamsScore.no,  category: "Ambas Marcam", conflictIds: conflictFor("bts-no")  }] : []),
                  // Intervalo
                  ...(_mk?.halfTime?.home && safe(_mk.halfTime.home) ? [{ id: "ht-home", label: `${_hn} Vence 1º Tempo`, market: "halftime", selection: "ht-home", odds: _mk.halfTime.home, category: "Intervalo", conflictIds: conflictFor("ht-home") }] : []),
                  ...(_mk?.halfTime?.draw && safe(_mk.halfTime.draw) ? [{ id: "ht-draw", label: "Empate ao Intervalo",    market: "halftime", selection: "ht-draw", odds: _mk.halfTime.draw, category: "Intervalo", conflictIds: conflictFor("ht-draw") }] : []),
                  ...(_mk?.halfTime?.away && safe(_mk.halfTime.away) ? [{ id: "ht-away", label: `${_an} Vence 1º Tempo`, market: "halftime", selection: "ht-away", odds: _mk.halfTime.away, category: "Intervalo", conflictIds: conflictFor("ht-away") }] : []),
                  // Golos por Equipa
                  ...(((_mk as any)?.teamGoals?.homeOver15 ?? 0) > 1.01 ? [{ id: "h-o15", label: `${_hn} Marca 2+`, market: "teamgoals", selection: "h-o15", odds: (_mk as any).teamGoals.homeOver15 as number, category: "Golos por Equipa", conflictIds: [] }] : []),
                  ...(((_mk as any)?.teamGoals?.awayOver05 ?? 0) > 1.01 ? [{ id: "a-o05", label: `${_an} Marca`,    market: "teamgoals", selection: "a-o05", odds: (_mk as any).teamGoals.awayOver05 as number, category: "Golos por Equipa", conflictIds: [] }] : []),
                  // Escanteios
                  ...(_mk?.corners?.o85 && safe(_mk.corners.o85) ? [{ id: "cn-85",  label: "Escanteios +8.5",  market: "corners", selection: "cn-85",  odds: _mk.corners.o85,  category: "Escanteios", conflictIds: [] }] : []),
                  ...(_mk?.corners?.o95 && safe(_mk.corners.o95) ? [{ id: "cn-95",  label: "Escanteios +9.5",  market: "corners", selection: "cn-95",  odds: _mk.corners.o95,  category: "Escanteios", conflictIds: [] }] : []),
                  ...(_mk?.corners?.o105 && safe(_mk.corners.o105) ? [{ id: "cn-105", label: "Escanteios +10.5", market: "corners", selection: "cn-105", odds: _mk.corners.o105, category: "Escanteios", conflictIds: [] }] : []),
                ];

                if (builderMarkets.length === 0) {
                  return (
                    <div className="mt-4 text-center py-10 text-zinc-500">
                      <div className="text-3xl mb-3">🧩</div>
                      <div className="text-sm font-medium">
                        Bet Builder não disponível para esta partida.
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="mt-2">
                    <BetBuilderPanel
                      match={{
                        id: String(match.id),
                        home: match.home,
                        away: match.away,
                        league: match.league,
                        country: match.country,
                        sport: match.sport,
                        date: match.date,
                        time: match.time,
                        scheduledDate: (match as any).scheduledDate,
                        scheduledTime: (match as any).scheduledTime,
                      }}
                      markets={builderMarkets}
                      bets={bets}
                      setBets={setBets}
                      setBetMode={setBetMode}
                      setBetSlipOpenMobile={setBetSlipOpenMobile}
                      isDarkTheme={isDarkTheme}
                    />
                  </div>
                );
              })()}

              {/* ── SUSPENSION BANNER (modal) ── */}
              {((match.marketSuspension &&
                Object.values(match.marketSuspension).some(
                  (ts) => ts > Date.now(),
                )) ||
                hasBlockingSuspensionReason(match)) && (
                <div className="mb-4">
                  <SuspensionBanner match={match} />
                </div>
              )}

              {/* ── PRORROGAÇÃO ── */}
              {isFootball &&
                showET &&
                !showPen &&
                m?.etExtra &&
                (modalTab === "prolongamento" || modalTab === "todos") && (
                  <div className="mb-2">
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-red-500 bg-red-950/40 border border-red-800/40 rounded px-2 py-0.5">
                        ⏱ Prorrogação em curso
                      </span>
                    </div>
                    <MarketGroup title="Vencedor da Eliminatória">
                      <MarketOddsBtn
                        match={match}
                        sel="et-tw-home"
                        odd={m.etExtra.tieWinner.home}
                        market="prolongamento"
                        label={match.home}
                      />
                      <MarketOddsBtn
                        match={match}
                        sel="et-tw-away"
                        odd={m.etExtra.tieWinner.away}
                        market="prolongamento"
                        label={match.away}
                      />
                    </MarketGroup>
                    {m.etExtra.totalGoals.o05 > 0 && (
                      <MarketGroup title="Golos na Prorrogação — 0.5">
                        <MarketOddsBtn
                          match={match}
                          sel="et-o05"
                          odd={m.etExtra.totalGoals.o05}
                          market="prolongamento"
                          label="Mais de 0.5"
                        />
                        <MarketOddsBtn
                          match={match}
                          sel="et-u05"
                          odd={m.etExtra.totalGoals.u05}
                          market="prolongamento"
                          label="Menos de 0.5"
                        />
                      </MarketGroup>
                    )}
                    {m.etExtra.totalGoals.o15 > 0 && (
                      <MarketGroup title="Golos na Prorrogação — 1.5">
                        <MarketOddsBtn
                          match={match}
                          sel="et-o15"
                          odd={m.etExtra.totalGoals.o15}
                          market="prolongamento"
                          label="Mais de 1.5"
                        />
                        <MarketOddsBtn
                          match={match}
                          sel="et-u15"
                          odd={m.etExtra.totalGoals.u15}
                          market="prolongamento"
                          label="Menos de 1.5"
                        />
                      </MarketGroup>
                    )}
                    {m.etExtra.totalGoals.o25 > 0 && (
                      <MarketGroup title="Golos na Prorrogação — 2.5">
                        <MarketOddsBtn
                          match={match}
                          sel="et-o25"
                          odd={m.etExtra.totalGoals.o25}
                          market="prolongamento"
                          label="Mais de 2.5"
                        />
                        <MarketOddsBtn
                          match={match}
                          sel="et-u25"
                          odd={m.etExtra.totalGoals.u25}
                          market="prolongamento"
                          label="Menos de 2.5"
                        />
                      </MarketGroup>
                    )}
                    {m.etExtra.totalGoals.o35 > 0 && (
                      <MarketGroup title="Golos na Prorrogação — 3.5">
                        <MarketOddsBtn
                          match={match}
                          sel="et-o35"
                          odd={m.etExtra.totalGoals.o35}
                          market="prolongamento"
                          label="Mais de 3.5"
                        />
                        <MarketOddsBtn
                          match={match}
                          sel="et-u35"
                          odd={m.etExtra.totalGoals.u35}
                          market="prolongamento"
                          label="Menos de 3.5"
                        />
                      </MarketGroup>
                    )}
                    {m.etExtra.totalGoals.o45 > 0 && (
                      <MarketGroup title="Golos na Prorrogação — 4.5">
                        <MarketOddsBtn
                          match={match}
                          sel="et-o45"
                          odd={m.etExtra.totalGoals.o45}
                          market="prolongamento"
                          label="Mais de 4.5"
                        />
                        <MarketOddsBtn
                          match={match}
                          sel="et-u45"
                          odd={m.etExtra.totalGoals.u45}
                          market="prolongamento"
                          label="Menos de 4.5"
                        />
                      </MarketGroup>
                    )}
                    <MarketGroup title="Resultado da Prorrogação">
                      <MarketOddsBtn
                        match={match}
                        sel="et-home"
                        odd={m.etExtra.etResult.home}
                        market="prolongamento"
                        label={match.home}
                      />
                      <MarketOddsBtn
                        match={match}
                        sel="et-draw"
                        odd={m.etExtra.etResult.draw}
                        market="prolongamento"
                        label="Empate → Penáltis"
                      />
                      <MarketOddsBtn
                        match={match}
                        sel="et-away"
                        odd={m.etExtra.etResult.away}
                        market="prolongamento"
                        label={match.away}
                      />
                    </MarketGroup>
                    <MarketGroup title="Equipa a Marcar na Prorrogação">
                      <MarketOddsBtn
                        match={match}
                        sel="et-ng-home"
                        odd={m.etExtra.nextGoal.home}
                        market="prolongamento"
                        label={`Gol 1 — ${match.home}`}
                      />
                      <MarketOddsBtn
                        match={match}
                        sel="et-ng-away"
                        odd={m.etExtra.nextGoal.away}
                        market="prolongamento"
                        label={`Gol 2 — ${match.away}`}
                      />
                    </MarketGroup>
                    {m.etExtra.firstHalfResult.home > 0 && (
                      <MarketGroup title="1º Tempo da Prorrogação">
                        <MarketOddsBtn
                          match={match}
                          sel="et-1t-home"
                          odd={m.etExtra.firstHalfResult.home}
                          market="prolongamento"
                          label={match.home}
                        />
                        <MarketOddsBtn
                          match={match}
                          sel="et-1t-draw"
                          odd={m.etExtra.firstHalfResult.draw}
                          market="prolongamento"
                          label="Empate"
                        />
                        <MarketOddsBtn
                          match={match}
                          sel="et-1t-away"
                          odd={m.etExtra.firstHalfResult.away}
                          market="prolongamento"
                          label={match.away}
                        />
                      </MarketGroup>
                    )}
                    {m.etExtra.secondHalfResult.home > 0 && (
                      <MarketGroup title="2º Tempo da Prorrogação">
                        <MarketOddsBtn
                          match={match}
                          sel="et-2t-home"
                          odd={m.etExtra.secondHalfResult.home}
                          market="prolongamento"
                          label={match.home}
                        />
                        <MarketOddsBtn
                          match={match}
                          sel="et-2t-draw"
                          odd={m.etExtra.secondHalfResult.draw}
                          market="prolongamento"
                          label="Empate"
                        />
                        <MarketOddsBtn
                          match={match}
                          sel="et-2t-away"
                          odd={m.etExtra.secondHalfResult.away}
                          market="prolongamento"
                          label={match.away}
                        />
                      </MarketGroup>
                    )}
                    {m.etExtra.corners.o15 > 0 && (
                      <MarketGroup title="Cantos na Prorrogação — 1.5">
                        <MarketOddsBtn
                          match={match}
                          sel="et-c15"
                          odd={m.etExtra.corners.o15}
                          market="prolongamento"
                          label="Mais de 1.5"
                        />
                        <MarketOddsBtn
                          match={match}
                          sel="et-cu15"
                          odd={m.etExtra.corners.u15}
                          market="prolongamento"
                          label="Menos de 1.5"
                        />
                      </MarketGroup>
                    )}
                    {m.etExtra.corners.o25 > 0 && (
                      <MarketGroup title="Cantos na Prorrogação — 2.5">
                        <MarketOddsBtn
                          match={match}
                          sel="et-c25"
                          odd={m.etExtra.corners.o25}
                          market="prolongamento"
                          label="Mais de 2.5"
                        />
                        <MarketOddsBtn
                          match={match}
                          sel="et-cu25"
                          odd={m.etExtra.corners.u25}
                          market="prolongamento"
                          label="Menos de 2.5"
                        />
                      </MarketGroup>
                    )}
                    {m.etExtra.corners.o35 > 0 && (
                      <MarketGroup title="Cantos na Prorrogação — 3.5">
                        <MarketOddsBtn
                          match={match}
                          sel="et-c35"
                          odd={m.etExtra.corners.o35}
                          market="prolongamento"
                          label="Mais de 3.5"
                        />
                        <MarketOddsBtn
                          match={match}
                          sel="et-cu35"
                          odd={m.etExtra.corners.u35}
                          market="prolongamento"
                          label="Menos de 3.5"
                        />
                      </MarketGroup>
                    )}
                    {m.etExtra.cards.o05 > 0 && (
                      <MarketGroup title="Cartões na Prorrogação — 0.5">
                        <MarketOddsBtn
                          match={match}
                          sel="et-cd05"
                          odd={m.etExtra.cards.o05}
                          market="prolongamento"
                          label="Mais de 0.5"
                        />
                        <MarketOddsBtn
                          match={match}
                          sel="et-cdu05"
                          odd={m.etExtra.cards.u05}
                          market="prolongamento"
                          label="Menos de 0.5"
                        />
                      </MarketGroup>
                    )}
                    {m.etExtra.cards.o15 > 0 && (
                      <MarketGroup title="Cartões na Prorrogação — 1.5">
                        <MarketOddsBtn
                          match={match}
                          sel="et-cd15"
                          odd={m.etExtra.cards.o15}
                          market="prolongamento"
                          label="Mais de 1.5"
                        />
                        <MarketOddsBtn
                          match={match}
                          sel="et-cdu15"
                          odd={m.etExtra.cards.u15}
                          market="prolongamento"
                          label="Menos de 1.5"
                        />
                      </MarketGroup>
                    )}
                    {m.etExtra.cards.o25 > 0 && (
                      <MarketGroup title="Cartões na Prorrogação — 2.5">
                        <MarketOddsBtn
                          match={match}
                          sel="et-cd25"
                          odd={m.etExtra.cards.o25}
                          market="prolongamento"
                          label="Mais de 2.5"
                        />
                        <MarketOddsBtn
                          match={match}
                          sel="et-cdu25"
                          odd={m.etExtra.cards.u25}
                          market="prolongamento"
                          label="Menos de 2.5"
                        />
                      </MarketGroup>
                    )}
                    {m.etExtra.exactScore &&
                      Object.keys(m.etExtra.exactScore).length > 0 && (
                        <MarketAccordionSection
                          title="Placar Exato da Prorrogação"
                          defaultOpen={false}
                          count={Object.keys(m.etExtra.exactScore).length}
                        >
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            {Object.entries(m.etExtra.exactScore).map(
                              ([score, odd]) => (
                                <MarketOddsBtn
                                  key={score}
                                  match={match}
                                  sel={`et-cs-${score}`}
                                  odd={odd}
                                  market="prolongamento"
                                  label={score === "outro" ? "Outro" : score}
                                />
                              ),
                            )}
                          </div>
                        </MarketAccordionSection>
                      )}
                  </div>
                )}

              {/* ── PENÁLTIS (SHOOTOUT) ── */}
              {/* Penalty section handled by early-return above when showPen */}

              {/* ── RESULTADO / VENCEDOR ── hide for live football when result is obvious ── */}
              {(modalTab === "resultado" || modalTab === "todos") &&
                (() => {
                  const hideResult =
                    match.isLive &&
                    isFootball &&
                    (showET ||
                      showPen ||
                      (() => {
                        const minOdd = Math.min(
                          match.odds.home,
                          match.odds.away,
                        );
                        if (minOdd <= 1.05) return true;
                        const min = getDisplayMinute(match);
                        const diff = Math.abs(
                          (match.homeScore ?? 0) - (match.awayScore ?? 0),
                        );
                        if (min >= 80 && diff >= 2) return true;
                        if (min >= 85 && diff >= 1) return true;
                        return false;
                      })());
                  if (hideResult) return null;
                  return (
                    <MarketGroup
                      title={
                        isBasketball
                          ? "Vencedor da Partida"
                          : isTennis
                            ? "Vencedor do Jogo"
                            : "Resultado Final"
                      }
                    >
                      <MarketOddsBtn
                        match={match}
                        sel="home"
                        odd={match.odds.home}
                        market="result"
                        label={match.home}
                        suspKey={isTennis ? "result" : undefined}
                      />
                      {!isTennis && match.odds.draw > 0 && (
                        <MarketOddsBtn
                          match={match}
                          sel="draw"
                          odd={match.odds.draw}
                          market="result"
                          label="Empate"
                        />
                      )}
                      <MarketOddsBtn
                        match={match}
                        sel="away"
                        odd={match.odds.away}
                        market="result"
                        label={match.away}
                        suspKey={isTennis ? "result" : undefined}
                      />
                    </MarketGroup>
                  );
                })()}

              {/* ── FUTEBOL: RESULTADO COM PAGAMENTO ANTECIPADO ── */}
              {isFootball &&
                !showET &&
                !showPen &&
                !isLateGame &&
                (modalTab === "resultado" || modalTab === "todos") &&
                m &&
                m.h2hEarlyPayout &&
                m.h2hEarlyPayout.home > 0 && (
                  <MarketGroup title="Resultado — Pagamento Antecipado">
                    <MarketOddsBtn
                      match={match}
                      sel="h2hep-home"
                      odd={m.h2hEarlyPayout.home}
                      market="result"
                      label={match.home}
                    />
                    <MarketOddsBtn
                      match={match}
                      sel="h2hep-draw"
                      odd={m.h2hEarlyPayout.draw}
                      market="result"
                      label="Empate"
                    />
                    <MarketOddsBtn
                      match={match}
                      sel="h2hep-away"
                      odd={m.h2hEarlyPayout.away}
                      market="result"
                      label={match.away}
                    />
                  </MarketGroup>
                )}

              {/* ── FUTEBOL: DUPLA CHANCE ── */}
              {isFootball &&
                !showET &&
                !showPen &&
                !isLateGame &&
                (modalTab === "dupla" || modalTab === "todos") &&
                m &&
                m.doubleChance.homeOrDraw > 0 && (
                  <div>
                    <MarketGroup title="Dupla Chance">
                      <MarketOddsBtn
                        match={match}
                        sel="homeOrDraw"
                        odd={m.doubleChance.homeOrDraw}
                        market="dupla"
                        label={`${match.home} ou X`}
                      />
                      <MarketOddsBtn
                        match={match}
                        sel="awayOrDraw"
                        odd={m.doubleChance.awayOrDraw}
                        market="dupla"
                        label={`${match.away} ou X`}
                      />
                      <MarketOddsBtn
                        match={match}
                        sel="homeOrAway"
                        odd={m.doubleChance.homeOrAway}
                        market="dupla"
                        label="1 ou 2"
                      />
                    </MarketGroup>
                    {m.bothTeamsScore.yes > 0 && (
                      <MarketGroup title="Ambas as Equipas Marcam">
                        <MarketOddsBtn
                          match={match}
                          sel="bts-yes"
                          odd={m.bothTeamsScore.yes}
                          market="dupla"
                          label="Sim"
                        />
                        <MarketOddsBtn
                          match={match}
                          sel="bts-no"
                          odd={m.bothTeamsScore.no}
                          market="dupla"
                          label="Não"
                        />
                      </MarketGroup>
                    )}
      toast.error("Número de documento inválido.");
      return;
    }
    if (kycNif && !/^\d{9}$/.test(kycNif)) {
      toast.error("NIF inválido. Deve ter 9 dígitos.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/profile/kyc/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          documentType: kycDocType,
          documentNumber: kycDocNumber.trim(),
          nif: kycNif,
        }),
      });
      const data = (await r.json()) as { kycStatus?: string; error?: string };
      if (!r.ok) {
        if (isInvalidTokenError(r.status, data.error)) {
          onAuthInvalid("Sessão expirada. Entre novamente para continuar.");
          return;
        }
        toast.error(data.error ?? "Erro ao submeter documentos.");
        return;
      }
      setKycDone(true);
      onSuccess();
      toast.success(
        "Documentos submetidos! A verificação será feita em 1-2 dias úteis.",
      );
    } catch {
      toast.error("Erro de ligação. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function handleWithdraw() {
    const wAmountNum = parseFloat(wAmount.replace(",", "."));
    if (isNaN(wAmountNum) || wAmountNum < 20) {
      toast.error("Valor mínimo de levantamento: €20.");
      return;
    }
    if (wAmountNum > balance) {
      toast.error("Saldo insuficiente.");
      return;
    }
    const cleanIban = wIban.replace(/\s/g, "").toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(cleanIban)) {
      toast.error("IBAN inválido.");
      return;
    }
    if (!wName.trim() || wName.trim().length < 3) {
      toast.error("Nome do titular inválido.");
      return;
    }
    if (!/^\d{9}$/.test(wNif)) {
      toast.error("NIF inválido. Deve ter 9 dígitos.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/withdrawals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: wAmountNum,
          iban: cleanIban,
          holderName: wName.trim(),
          nif: wNif,
        }),
      });
      const data = (await r.json()) as {
        withdrawal?: { id: number };
        error?: string;
        code?: string;
      };
      if (!r.ok) {
        if (isInvalidTokenError(r.status, data.error)) {
          onAuthInvalid("Sessão expirada. Entre novamente para continuar.");
          return;
        }
        toast.error(data.error ?? "Erro ao submeter pedido.");
        return;
      }
      setWDone(true);
      onSuccess();
      toast.success(
        "Pedido de levantamento submetido! Processado em 2-5 dias úteis.",
      );
    } catch {
      toast.error("Erro de ligação. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  function triggerPromoNotif(depositAmount: number) {
    if (depositAmount >= 20) onPromoNotif("freebets20");
    else if (depositAmount >= 10) onPromoNotif("freebets10");
  }

  async function handleMultibanco() {
    if (!amountValid) {
      toast.error("Valor inválido. Mínimo €10.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/payments/multibanco", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount }),
      });
      const data = (await r.json()) as {
        entity?: string;
        reference?: string;
        amount?: string;
        expiresAt?: string;
        orderId?: string;
        error?: string;
      };
      if (!r.ok) {
        if (isInvalidTokenError(r.status, data.error)) {
          onAuthInvalid("Sessão expirada. Entre novamente para continuar.");
          return;
        }
        toast.error(data.error ?? "Erro ao gerar referência.");
        return;
      }
      if (
        !data.entity ||
        !data.reference ||
        !data.expiresAt ||
        !data.orderId ||
        !data.amount
      ) {
        toast.error(
          "A Stripe não devolveu a entidade e referência Multibanco.",
        );
        return;
      }
      setMbRef({
        entity: data.entity!,
        reference: data.reference!,
        amount: data.amount!,
        expiresAt: data.expiresAt!,
        orderId: data.orderId!,
      });
      toast.success("Referência Multibanco gerada! Pague em qualquer ATM.");
    } catch {
      toast.error("Erro de ligação. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMbway() {
    if (!amountValid) {
      toast.error("Valor inválido. Mínimo €10.");
      return;
    }
    const phoneClean = mbwayPhone.replace(/\s/g, "");
    if (phoneClean.length !== 9) {
      toast.error("Número de telemóvel inválido.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/payments/mbway", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount, phone: phoneClean }),
      });
      const data = (await r.json()) as {
        orderId?: string;
        amount?: string;
        status?: string;
        message?: string;
        error?: string;
      };
      if (!r.ok) {
        if (isInvalidTokenError(r.status, data.error)) {
          onAuthInvalid("Sessão expirada. Entre novamente para continuar.");
          return;
        }
        toast.error(data.error ?? "Erro ao enviar pedido MB WAY.");
        return;
      }
      if (!data.orderId) {
        toast.error("A Stripe não devolveu a ordem MB WAY.");
        return;
      }
      if (data.status === "completed") {
        setMbwayConfirmed(true);
        setMbwayDone(true);
        setMbwayOrderId(null);
        toast.success(
          `Pagamento MB WAY confirmado! € ${parseFloat(data.amount ?? String(amount)).toFixed(2)} adicionado ao seu saldo.`,
        );
        onSuccess();
        triggerPromoNotif(amount);
        onClose();
      } else {
        setMbwayDone(true);
        setMbwayConfirmed(false);
        setMbwayOrderId(data.orderId);
        toast.success(
          data.message ?? "Pedido MB WAY enviado! Confirme na app MB WAY.",
        );
      }
    } catch {
      toast.error("Erro de ligação. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCard() {
    if (!amountValid) {
      toast.error("Valor inválido. Mínimo €10.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/payments/card", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount }),
      });
      const data = (await r.json()) as CardIntentResponse;
      if (
        !r.ok ||
        !data.clientSecret ||
        !data.orderId ||
        !data.publishableKey
      ) {
        if (isInvalidTokenError(r.status, data.error)) {
          onAuthInvalid("Sessão expirada. Entre novamente para continuar.");
          return;
        }
        toast.error(data.error ?? "Erro ao iniciar pagamento por cartão.");
        return;
      }
      setCardClientSecret(data.clientSecret);
      setCardOrderId(data.orderId);
      setCardPublishableKey(data.publishableKey);
      setCardPreparedAmount(amount);
      toast.success(
        "Pagamento por cartão preparado. Introduza os dados abaixo.",
      );
    } catch {
      toast.error("Erro de ligação. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v: boolean) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md p-0 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-zinc-900 to-zinc-800 px-5 py-4 border-b border-zinc-700 flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${mainTab === "deposit" ? "bg-emerald-600" : "bg-orange-600"}`}
          >
            {mainTab === "deposit" ? (
              <Plus size={18} strokeWidth={3} />
            ) : (
              <ChevronUp size={18} />
            )}
          </div>
          <div>
            <div className="font-black text-base">
              {mainTab === "deposit" ? "Depósito" : "Levantamento"}
            </div>
            <div className="text-xs text-zinc-400">
              {mainTab === "deposit" ? (
                <>
                  Processado por{" "}
                  <span className="text-white font-semibold">Stripe</span>
                </>
              ) : (
                "Transferência bancária · IBAN"
              )}
            </div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-[10px] text-zinc-500">Saldo actual</div>
            <div className="text-green-400 font-black text-sm">
              € {balance.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Main tab: Deposit vs Withdraw */}
        <div className="grid grid-cols-2 border-b border-zinc-800">
          <button
            onClick={() => {
              setMainTab("deposit");
              setWDone(false);
            }}
            className={`flex items-center justify-center gap-2 py-3 text-xs font-bold transition-colors border-b-2 ${mainTab === "deposit" ? "border-emerald-500 text-white bg-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
          >
            <Plus size={14} /> DEPOSITAR
          </button>
          <button
            onClick={() => {
              setMainTab("withdraw");
              setWDone(false);
            }}
            className={`flex items-center justify-center gap-2 py-3 text-xs font-bold transition-colors border-b-2 ${mainTab === "withdraw" ? "border-orange-500 text-white bg-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
          >
            <ChevronUp size={14} /> LEVANTAR
          </button>
        </div>

        {/* Withdrawal form */}
        {mainTab === "withdraw" && (
          <div className="p-5 space-y-4">
            {wDone ? (
              <div className="text-center py-8 space-y-3">
                <div className="text-5xl">✅</div>
                <div className="font-black text-white text-lg">
                  Pedido submetido!
                </div>
                <div className="text-sm text-zinc-400 leading-relaxed">
                  O seu pedido de levantamento está em processamento.
                  <br />
                  Prazo estimado:{" "}
                  <strong className="text-white">2 a 5 dias úteis</strong>.
                </div>
                <Button
                  onClick={() => {
                    setWDone(false);
                    setWAmount("");
                  }}
                  variant="outline"
                  className="border-zinc-700 text-zinc-400 mt-2"
                >
                  Novo pedido
                </Button>
              </div>
            ) : needsKyc ? (
              /* ── KYC VERIFICATION FORM ── */
              <div className="space-y-4">
                <div className="bg-amber-900/20 border border-amber-600/40 rounded-xl px-4 py-3 flex gap-3 items-start">
                  <span className="text-xl mt-0.5">🪪</span>
                  <div>
                    <div className="text-sm font-bold text-amber-300 mb-1">
                      Verificação de Identidade Necessária
                    </div>
                    <div className="text-xs text-amber-200/70 leading-relaxed">
                      Para efectuar levantamentos é necessário verificar a sua
                      identidade. Preencha os dados abaixo — serão analisados
                      pela nossa equipa em 1–2 dias úteis.
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">
                    Tipo de Documento
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setKycDocType("cc")}
                      className={`py-2.5 rounded-xl border text-xs font-bold transition-colors ${kycDocType === "cc" ? "border-red-500 bg-red-500/10 text-red-400" : "border-zinc-700 text-zinc-400"}`}
                    >
                      🪪 Cartão de Cidadão
                    </button>
                    <button
                      onClick={() => setKycDocType("passport")}
                      className={`py-2.5 rounded-xl border text-xs font-bold transition-colors ${kycDocType === "passport" ? "border-red-500 bg-red-500/10 text-red-400" : "border-zinc-700 text-zinc-400"}`}
                    >
                      📗 Passaporte
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">
                    Número do Documento
                  </label>
                  <Input
                    placeholder={
                      kycDocType === "cc"
                        ? "Ex: 12345678 9 ZX0"
                        : "Ex: AB123456"
                    }
                    className="bg-zinc-900 border-zinc-700 text-white font-mono"
                    value={kycDocNumber}
                    onChange={(e) => setKycDocNumber(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">
                    NIF (Número de Contribuinte)
                  </label>
                  <Input
                    placeholder="123456789"
                    maxLength={9}
                    className="bg-zinc-900 border-zinc-700 text-white font-mono"
                    value={kycNif}
                    onChange={(e) =>
                      setKycNif(e.target.value.replace(/\D/g, ""))
                    }
                  />
                </div>
                <Button
                  onClick={handleKycSubmit}
                  disabled={loading}
                  className="w-full bg-red-600 hover:bg-red-500 text-white font-black h-11"
                >
                  {loading ? (
                    <RefreshCw className="animate-spin mr-2" size={16} />
                  ) : (
                    <span className="mr-2">🔒</span>
                  )}
                  Submeter Documentos
                </Button>
              </div>
            ) : kycStatus === "pending" && !kycDone ? (
              /* ── KYC PENDING NOTICE ── */
              <div className="space-y-4">
                <div className="bg-yellow-900/20 border border-yellow-600/40 rounded-xl px-4 py-4 text-center space-y-2">
                  <div className="text-3xl">⏳</div>
                  <div className="text-sm font-bold text-yellow-300">
                    Verificação em Análise
                  </div>
                  <div className="text-xs text-yellow-200/70 leading-relaxed">
                    Os seus documentos estão a ser verificados pela nossa
                    equipa. Poderá efectuar levantamentos assim que a
                    verificação for concluída.
                  </div>
                </div>
                <div className="bg-orange-900/20 border border-orange-800/40 rounded-xl px-4 py-3 text-xs text-orange-300 leading-relaxed">
                  Mínimo de levantamento:{" "}
                  <strong className="text-white">€20</strong>. Processado por
                  transferência bancária em 2–5 dias úteis.
                </div>
              </div>
            ) : (
              <>
                <div className="bg-orange-900/20 border border-orange-800/40 rounded-xl px-4 py-3 text-xs text-orange-300 leading-relaxed">
                  Mínimo de levantamento:{" "}
                  <strong className="text-white">€20</strong>. Processado por
                  transferência bancária em 2–5 dias úteis.
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">
                    Valor (€)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-sm">
                      €
                    </span>
                    <Input
                      type="number"
                      min={20}
                      max={50000}
                      placeholder="0,00"
                      className="pl-8 bg-zinc-900 border-zinc-700 text-white font-bold text-lg h-11"
                      value={wAmount}
                      onChange={(e) => setWAmount(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-1.5">
                    {[20, 50, 100, 250].map((v: number) => (
                      <button
                        key={v}
                        onClick={() => setWAmount(String(v))}
                        className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-colors ${wAmount === String(v) ? "border-orange-500 bg-orange-500/10 text-orange-400" : "border-zinc-700 hover:border-zinc-500 text-zinc-400"}`}
                      >
                        €{v}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">
                    IBAN
                  </label>
                  <Input
                    placeholder="PT50 0000 0000 0000 0000 0000 0"
                    className="bg-zinc-900 border-zinc-700 text-white font-mono"
                    value={wIban}
                    onChange={(e) => setWIban(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">
                      Nome Titular
                    </label>
                    <Input
                      placeholder="Nome completo"
                      className="bg-zinc-900 border-zinc-700 text-white"
                      value={wName}
                      onChange={(e) => setWName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">
                      NIF
                    </label>
                    <Input
                      placeholder="123456789"
                      maxLength={9}
                      className="bg-zinc-900 border-zinc-700 text-white font-mono"
                      value={wNif}
                      onChange={(e) =>
                        setWNif(e.target.value.replace(/\D/g, ""))
                      }
                    />
                  </div>
                </div>
                <Button
                  onClick={handleWithdraw}
                  disabled={loading}
                  className="w-full bg-orange-600 hover:bg-orange-500 text-white font-black h-11"
                >
                  {loading ? (
                    <RefreshCw className="animate-spin mr-2" size={16} />
                  ) : (
                    <ChevronUp size={16} className="mr-2" />
                  )}
                  Solicitar Levantamento
                </Button>
              </>
            )}
          </div>
        )}

        {/* Deposit content */}
        {mainTab === "deposit" && (
          <>
            <div className="grid grid-cols-3 border-b border-zinc-800">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => resetMethod(m.id)}
                  className={`flex flex-col items-center gap-1.5 py-3 text-[10px] font-bold transition-colors border-b-2 ${payMethod === m.id ? "border-emerald-500 text-white bg-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
                >
                  {m.logo2 ? (
                    <div className="flex items-center gap-1">
                      <img
                        src={m.logo}
                        alt="Visa"
                        className="h-5 w-auto object-contain"
                        draggable={false}
                      />
                      <img
                        src={m.logo2}
                        alt="Mastercard"
                        className="h-5 w-auto object-contain"
                        draggable={false}
                      />
                    </div>
                  ) : (
                    <img
                      src={m.logo}
                      alt={m.label}
                      className="h-6 w-auto max-w-[64px] object-contain"
                      draggable={false}
                    />
                  )}
                  {m.label}
                </button>
              ))}
            </div>

            <div className="p-5 space-y-4">
              {/* Amount selector */}
              <div>
                <p className="text-xs text-zinc-400 mb-2 font-semibold uppercase tracking-widest">
                  Valor
                </p>
                <div className="grid grid-cols-5 gap-1.5 mb-3">
                  {[10, 20, 50, 100, 200].map((v: number) => (
                    <button
                      key={v}
                      onClick={() => {
                        setDepositAmount(String(v));
                        setMbRef(null);
                        setMbwayDone(false);
                        setMbwayOrderId(null);
                        setMbwayConfirmed(false);
                        resetCardFlow();
                      }}
                      className={`py-2 rounded-lg border font-bold text-xs transition-colors ${depositAmount === String(v) ? "border-emerald-500 bg-emerald-500/10 text-emerald-400" : "border-zinc-700 hover:border-zinc-500 text-zinc-300"}`}
                    >
                      €{v}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-sm">
                    €
                  </span>
                  <Input
                    type="number"
                    min={10}
                    max={5000}
                    placeholder="0,00"
                    className="pl-8 bg-zinc-900 border-zinc-700 text-white font-bold text-lg h-11"
                    value={depositAmount}
                    onChange={(e) => {
                      setDepositAmount(e.target.value);
                      setMbRef(null);
                      setMbwayDone(false);
                      setMbwayOrderId(null);
                      setMbwayConfirmed(false);
                      resetCardFlow();
                    }}
                  />
                </div>
              </div>
              {amountValid && amount >= 10 && (
                <div
                  className={`rounded-xl p-2.5 flex items-center gap-2.5 text-xs ${amount >= 20 ? "bg-emerald-900/30 border border-emerald-600/30" : "bg-violet-900/30 border border-violet-600/30"}`}
                >
                  <span className="text-lg">🎁</span>
                  <span
                    className={`font-semibold ${amount >= 20 ? "text-emerald-300" : "text-violet-300"}`}
                  >
                    {amount >= 100
                      ? "Qualifica para 100% Bónus de Boas-Vindas!"
                      : amount >= 20
                        ? "Qualifica para €10 em Free Bets!"
                        : "Qualifica para €5 em Free Bets!"}
                  </span>
                </div>
              )}

              {/* ── MULTIBANCO ── */}
              {payMethod === "multibanco" && (
                <div className="space-y-3">
                  {!mbRef ? (
                    <>
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-400 leading-relaxed">
                        Gera uma referência Multibanco e paga em qualquer{" "}
                        <strong className="text-zinc-200">
                          ATM, HomeBanking ou App de banco
                        </strong>
                        . O saldo é creditado automaticamente após confirmação
                        de pagamento.
                      </div>
                      <Button
                        onClick={handleMultibanco}
                        disabled={loading || !amountValid}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black h-11 gap-2"
                      >
                        {loading ? (
                          <RefreshCw className="animate-spin" size={16} />
                        ) : (
                          <img
                            src="/logo-multibanco.png"
                            alt="Multibanco"
                            className="h-5 w-auto object-contain"
                          />
                        )}
                        Gerar Referência Multibanco
                      </Button>
                    </>
                  ) : (
                    <div className="bg-zinc-900 border border-emerald-600/30 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <img
                          src="/logo-multibanco.png"
                          alt="Multibanco"
                          className="h-7 w-auto object-contain"
                        />
                        <span className="text-[10px] bg-emerald-900/40 text-emerald-400 border border-emerald-600/30 px-2 py-0.5 rounded-full font-bold">
                          Aguardando pagamento
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-zinc-800 rounded-xl py-3">
                          <div className="text-[10px] text-zinc-500 mb-1">
                            Entidade
                          </div>
                          <div className="font-black text-white text-lg tracking-widest">
                            {mbRef.entity}
                          </div>
                        </div>
                        <div className="bg-zinc-800 rounded-xl py-3">
                          <div className="text-[10px] text-zinc-500 mb-1">
                            Referência
                          </div>
                          <div className="font-black text-white text-sm tracking-widest">
                            {mbRef.reference}
                          </div>
                        </div>
                        <div className="bg-zinc-800 rounded-xl py-3">
                          <div className="text-[10px] text-zinc-500 mb-1">
                            Valor
                          </div>
                          <div className="font-black text-emerald-400 text-lg">
                            €{mbRef.amount}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-zinc-500 text-center leading-relaxed">
                        Referência válida até{" "}
                        <span className="text-zinc-300 font-semibold">
                          {new Date(mbRef.expiresAt).toLocaleString("pt-PT")}
                        </span>
                        .<br />O saldo é creditado automaticamente após
                        pagamento.
                      </div>
                      <Button
                        variant="outline"
                        className="w-full border-zinc-700 text-zinc-400 h-9 text-xs"
                        onClick={() => setMbRef(null)}
                      >
                        Gerar nova referência
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* ── MB WAY ── */}
              {payMethod === "mbway" && (
                <div className="space-y-3">
                  {!mbwayDone ? (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-zinc-400 font-semibold uppercase tracking-widest">
                          Número MB WAY
                        </Label>
                        <div className="flex">
                          <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-zinc-700 bg-zinc-800 text-zinc-400 text-xs font-bold">
                            🇵🇹 +351
                          </span>
                          <Input
                            type="tel"
                            placeholder="9XX XXX XXX"
                            className="bg-zinc-900 border-zinc-700 text-white font-bold rounded-l-none h-11"
                            value={mbwayPhone}
                            onChange={(e) =>
                              setMbwayPhone(phoneMask(e.target.value))
                            }
                            maxLength={11}
                          />
                        </div>
                      </div>
                      <Button
                        onClick={handleMbway}
                        disabled={
                          loading ||
                          mbwayPhone.replace(/\s/g, "").length !== 9 ||
                          !amountValid
                        }
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black h-11 gap-2"
                      >
                        {loading ? (
                          <RefreshCw className="animate-spin" size={16} />
                        ) : (
                          <img
                            src="/logo-mbway.png"
                            alt="MB WAY"
                            className="h-5 w-auto object-contain"
                          />
                        )}
                        Enviar Pedido — €
                        {amountValid ? amount.toFixed(2) : "0.00"}
                      </Button>
                    </>
                  ) : (
                    <div className="bg-zinc-900 border border-emerald-600/30 rounded-2xl p-4 text-center space-y-3">
                      <div className="flex justify-center">
                        <img
                          src="/logo-mbway.png"
                          alt="MB WAY"
                          className="h-10 w-auto object-contain animate-pulse"
                        />
                      </div>
                      <div className="font-black text-white text-base">
                        Pedido enviado!
                      </div>
                      <div className="text-sm text-zinc-400">
                        Verifique a App MB WAY no número
                        <br />
                        <span className="text-white font-bold">
                          +351 {mbwayPhone}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500">
                        Tem 4 minutos para aceitar. Valor:{" "}
                        <span className="text-emerald-400 font-bold">
                          €{amount.toFixed(2)}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-600 mt-2">
                        O saldo é creditado automaticamente após confirmação.
                      </div>
                      <Button
                        variant="outline"
                        className="w-full border-zinc-700 text-zinc-400 h-9 text-xs"
                        onClick={() => {
                          setMbwayDone(false);
                          setMbwayOrderId(null);
                          setMbwayConfirmed(false);
                        }}
                      >
                        Enviar novo pedido
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* ── CARTÃO ── */}
              {payMethod === "card" && (
                <div className="space-y-3">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-400 leading-relaxed">
                    O pagamento com cartão é processado pela{" "}
                    <strong className="text-zinc-200">Stripe</strong> no próprio
                    modal. Só sairás desta página se o teu banco exigir
                    autenticação adicional 3D Secure.
                  </div>
                  {!cardClientSecret ||
                  !stripePromise ||
                  cardPreparedAmount !== amount ? (
                    <Button
                      onClick={handleCard}
                      disabled={loading || !amountValid}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black h-11 gap-2"
                    >
                      {loading ? (
                        <RefreshCw className="animate-spin" size={16} />
                      ) : (
                        <div className="flex items-center gap-1">
                          <img
                            src="/logo-visa.png"
                            alt="Visa"
                            className="h-4 w-auto object-contain"
                          />
                          <img
                            src="/logo-mastercard.png"
                            alt="Mastercard"
                            className="h-4 w-auto object-contain"
                          />
                        </div>
                      )}
                      Preparar Pagamento de €
                      {amountValid ? amount.toFixed(2) : "0.00"}
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      {stripeElementsOptions && (
                        <Elements
                          stripe={stripePromise}
                          options={stripeElementsOptions}
                        >
                          <CardDepositInlineForm
                            orderId={cardOrderId ?? ""}
                            onSucceeded={() => {
                              onSuccess();
                              triggerPromoNotif(amount);
                              onClose();
                            }}
                            onProcessing={() => {
                              onSuccess();
                              onClose();
                            }}
                          />
                        </Elements>
                      )}
                      <Button
                        variant="outline"
                        className="w-full border-zinc-700 text-zinc-400 h-9 text-xs"
                        onClick={resetCardFlow}
                      >
                        Recriar pagamento
                      </Button>
                    </div>
                  )}
                  <div className="flex items-center justify-center gap-3 mt-1">
                    <img
                      src="/logo-visa.png"
                      alt="Visa"
                      className="h-4 w-auto object-contain opacity-60"
                    />
                    <img
                      src="/logo-mastercard.png"
                      alt="Mastercard"
                      className="h-4 w-auto object-contain opacity-60"
                    />
                    <span className="text-[10px] text-zinc-600">
                      🔒 Pagamento seguro 3D Secure · Stripe
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Accepted payment logos footer */}
            {mainTab === "deposit" && (
              <div className="border-t border-zinc-800 px-5 py-3 flex items-center justify-between">
                <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold">
                  Métodos aceites
                </span>
                <div className="flex items-center gap-2">
                  <img
                    src="/logo-multibanco.png"
                    alt="Multibanco"
                    className="h-5 w-auto object-contain opacity-70 hover:opacity-100 transition-opacity"
                  />
                  <img
                    src="/logo-mbway.png"
                    alt="MB WAY"
                    className="h-5 w-auto object-contain opacity-70 hover:opacity-100 transition-opacity"
                  />
                  <img
                    src="/logo-visa.png"
                    alt="Visa"
                    className="h-4 w-auto object-contain opacity-70 hover:opacity-100 transition-opacity"
                  />
                  <img
                    src="/logo-mastercard.png"
                    alt="Mastercard"
                    className="h-4 w-auto object-contain opacity-70 hover:opacity-100 transition-opacity"
                  />
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
