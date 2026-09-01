import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { finlandMunicipalities, fishSpecies } from "../lib/constants.js";
import { finlandMunicipalitiesByRegion, finlandRegions } from "../lib/municipalityRegions.js";
import { normalizeDestinationCities, styles } from "../lib/ui.js";

export function MunicipalitySelect({ value, onChange, placeholder = "Valitse paikkakunta" }) {
  const [query, setQuery] = useState(value || "");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef(null);
  const generatedId = useId();

  const normalizeMunicipality = useCallback(
    (text) =>
      String(text || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("fi-FI")
        .trim(),
    [],
  );

  const filteredMunicipalities = useMemo(() => {
    const normalizedQuery = normalizeMunicipality(query);
    if (!normalizedQuery) return finlandMunicipalities;

    const prefixMatches = [];
    const otherMatches = [];
    finlandMunicipalities.forEach((municipality) => {
      const normalizedMunicipality = normalizeMunicipality(municipality);
      if (normalizedMunicipality.startsWith(normalizedQuery)) {
        prefixMatches.push(municipality);
      } else if (normalizedMunicipality.includes(normalizedQuery)) {
        otherMatches.push(municipality);
      }
    });
    return [...prefixMatches, ...otherMatches];
  }, [normalizeMunicipality, query]);

  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  useEffect(() => {
    const closeOnOutsidePress = (event) => {
      if (!wrapperRef.current?.contains(event.target)) {
        setIsOpen(false);
        setActiveIndex(-1);
        setQuery(value || "");
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [value]);

  const selectMunicipality = (municipality) => {
    setQuery(municipality);
    setIsOpen(false);
    setActiveIndex(-1);
    onChange?.({
      target: { value: municipality },
      currentTarget: { value: municipality },
    });
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) =>
        Math.min(current + 1, filteredMunicipalities.length - 1),
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) =>
        current <= 0 ? filteredMunicipalities.length - 1 : current - 1,
      );
    } else if (event.key === "Enter" && isOpen && filteredMunicipalities.length) {
      event.preventDefault();
      selectMunicipality(filteredMunicipalities[Math.max(activeIndex, 0)]);
    } else if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
      setQuery(value || "");
    }
  };

  const listboxId = `municipality-list-${generatedId.replace(/:/g, "")}`;

  return (
    <div ref={wrapperRef} style={{ position: "relative", width: "100%", minWidth: 0 }}>
      <input
        type="search"
        value={query}
        placeholder="Hae paikkakuntaa"
        aria-label={placeholder}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={
          isOpen && activeIndex >= 0
            ? `${listboxId}-option-${activeIndex}`
            : undefined
        }
        autoComplete="off"
        style={{ ...styles.input, boxSizing: "border-box", width: "100%" }}
        onFocus={() => setIsOpen(true)}
        onClick={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          setIsOpen(true);
          setActiveIndex(-1);
          if (!nextQuery) {
            onChange?.({ target: { value: "" }, currentTarget: { value: "" } });
          }
        }}
      />
      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          style={{
            position: "absolute",
            zIndex: 1000,
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            maxHeight: 260,
            overflowY: "auto",
            background: "#fff",
            border: "1px solid #b8d8ff",
            borderRadius: 14,
            boxShadow: "0 12px 30px rgba(25, 68, 130, 0.18)",
            padding: 6,
          }}
        >
          {filteredMunicipalities.length ? (
            filteredMunicipalities.map((municipality, index) => (
              <button
                key={municipality}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={municipality === value}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => selectMunicipality(municipality)}
                onMouseEnter={() => setActiveIndex(index)}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "11px 12px",
                  border: 0,
                  borderRadius: 9,
                  background:
                    index === activeIndex || municipality === value
                      ? "#e8f3ff"
                      : "transparent",
                  color: "#101b34",
                  textAlign: "left",
                  font: "inherit",
                  cursor: "pointer",
                }}
              >
                {municipality}
              </button>
            ))
          ) : (
            <div style={{ padding: "12px", color: "#64748b" }}>
              Paikkakuntaa ei löytynyt
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MultiCityInput({ value, onChange, suggestions = [], label = "Valitut kaupungit" }) {
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedArea, setSelectedArea] = useState("");
  const selectedCities = normalizeDestinationCities(value);
  const quickSuggestions = normalizeDestinationCities(suggestions).filter((city) => !selectedCities.includes(city)).slice(0, 8);

  const addCity = (city) => {
    const normalized = String(city || "").trim();
    if (!normalized) return;
    onChange(normalizeDestinationCities([...selectedCities, normalized]));
    setSelectedCity("");
  };

  const removeCity = (city) => {
    onChange(selectedCities.filter((item) => item !== city));
  };

  const addArea = (area) => {
    if (!area) return;
    const areaCities = area === "__all__"
      ? finlandMunicipalities
      : finlandMunicipalitiesByRegion[area] || [];
    onChange(normalizeDestinationCities([...selectedCities, ...areaCities]));
    setSelectedArea("");
  };

  return (
    <div style={{ ...styles.stack, gap: 10 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ minWidth: 220, flex: "1 1 260px" }}>
          <MunicipalitySelect value={selectedCity} onChange={(e) => setSelectedCity(e.target.value)} placeholder="Valitse kaupunki" />
        </div>
        <button type="button" style={styles.button} onClick={() => addCity(selectedCity)} disabled={!selectedCity}>
          Lisää kaupunki
        </button>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ minWidth: 220, flex: "1 1 260px" }}>
          <select style={styles.input} value={selectedArea} onChange={(e) => setSelectedArea(e.target.value)}>
            <option value="">Valitse kaikki kaupungit tai maakunta</option>
            <option value="__all__">Kaikki kaupungit</option>
            <optgroup label="Maakunnat">
              {finlandRegions.map((region) => (
                <option key={region} value={region}>{region}</option>
              ))}
            </optgroup>
          </select>
        </div>
        <button type="button" style={styles.button} onClick={() => addArea(selectedArea)} disabled={!selectedArea}>
          Lisää alue
        </button>
      </div>
      {quickSuggestions.length > 0 ? (
        <div style={{ ...styles.stack, gap: 6 }}>
          <div style={styles.small}>Nopeat ehdotukset</div>
          <div style={styles.checkboxRow}>
            {quickSuggestions.map((city) => (
              <button key={city} type="button" style={styles.button} onClick={() => addCity(city)}>
                {city}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div style={{ ...styles.stack, gap: 6 }}>
        <div style={styles.small}>{label}</div>
        {selectedCities.length === 0 ? (
          <div style={styles.noticeInfo}>Ei vielä valittuja kaupunkeja.</div>
        ) : (
          <div style={styles.checkboxRow}>
            {selectedCities.map((city) => (
              <button key={city} type="button" style={styles.checkboxCard} onClick={() => removeCity(city)}>
                {city} x
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function LandingPlaceInput({ value, onChange, options, placeholder = "Esim. Kyläniemen kalasatama" }) {
  return (
    <>
      <input style={styles.input} value={value} onChange={onChange} placeholder={placeholder} list="landing-place-options" />
      <datalist id="landing-place-options">
        {(options || []).map((option) => <option key={option} value={option} />)}
      </datalist>
    </>
  );
}

export function RememberedTextInput({ value, onChange, options, placeholder = "", listId }) {
  return (
    <>
      <input style={styles.input} value={value} onChange={onChange} placeholder={placeholder} list={listId} />
      <datalist id={listId}>
        {(options || []).map((option) => <option key={option} value={option} />)}
      </datalist>
    </>
  );
}

export function FishSpeciesInput({ value, onChange, placeholder = "Valitse tai kirjoita kalalaji", disabled = false }) {
  return (
    <select style={styles.input} value={value} onChange={onChange} disabled={disabled}>
      <option value="">{placeholder}</option>
      {fishSpecies.map((species) => <option key={species} value={species}>{species}</option>)}
    </select>
  );
}
